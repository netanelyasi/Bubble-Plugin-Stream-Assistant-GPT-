async function(instance, properties, context) {
    const API_URL = "https://api.openai.com/v1";
    const API_KEY = properties.api_key;
    const assistantId = properties.assistant_id;
    const userInput = properties.user;
    let threadId = properties.thread_id || instance.data.thread_id || null;  // Use the provided thread ID or the stored thread ID if available

    let output = "";
    const startTime = Date.now();
    let logMessages = [];

    const log = (message) => {
        const timestamp = new Date().toISOString();
        logMessages.push(`[${timestamp}] ${message}`);
        updateState();
    };

    const updateState = () => {
        try {
            instance.publishState('log', logMessages.join('\n'));
            instance.publishState('output', output);
            if (threadId) {
                instance.publishState('thread_id', threadId);
                instance.data.thread_id = threadId;  // Store the thread ID for future use
            }
        } catch (error) {
            console.error("Error updating state:", error);
        }
    };

    const createThread = async () => {
        try {
            log("Creating thread...");
            const response = await fetch(`${API_URL}/threads`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${API_KEY}`,
                    "OpenAI-Beta": "assistants=v2"
                },
                body: JSON.stringify({
                    messages: [
                        { role: "user", content: userInput }
                    ]
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Error creating thread: ${response.status} - ${response.statusText}\n${errorText}`);
            }

            const threadData = await response.json();
            threadId = threadData.id;
            log(`Thread created successfully. Thread ID: ${threadId}`);
            return threadId;
        } catch (error) {
            log(`Error creating thread: ${error.message}`);
            throw error;
        }
    };

    const addMessageToThread = async (threadId, userInput) => {
        try {
            log("Adding message to thread...");
            const response = await fetch(`${API_URL}/threads/${threadId}/messages`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${API_KEY}`,
                    "OpenAI-Beta": "assistants=v2"
                },
                body: JSON.stringify({
                    role: "user",
                    content: userInput
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Error adding message to thread: ${response.status} - ${response.statusText}\n${errorText}`);
            }

            log(`Message added to thread ${threadId} successfully.`);
        } catch (error) {
            log(`Error adding message to thread: ${error.message}`);
            throw error;
        }
    };

    const createRun = async (threadId) => {
        try {
            log(`Creating run for thread ${threadId}...`);
            const response = await fetch(`${API_URL}/threads/${threadId}/runs`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${API_KEY}`,
                    "OpenAI-Beta": "assistants=v2"
                },
                body: JSON.stringify({
                    assistant_id: assistantId,
                    stream: true
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Error creating run: ${response.status} - ${response.statusText}\n${errorText}`);
            }

            log("Run created successfully. Starting to process streamed response...");
            return response;
        } catch (error) {
            log(`Error creating run: ${error.message}`);
            throw error;
        }
    };

    const processStreamedResponse = async (response) => {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let runId = null;

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    log("Stream finished.");
                    break;
                }

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.trim() === "") continue;
                    if (line.trim() === "data: [DONE]") {
                        log("Received [DONE] signal.");
                        return { runId, completed: true };
                    }
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(5));
                            if (!runId && data.id) {
                                runId = data.id;
                            }
                            if (data.delta && data.delta.content) {
                                data.delta.content.forEach(content => {
                                    if (content.type === 'text') {
                                        output += content.text.value;
                                        updateState(); // Update the output state immediately
                                    }
                                });
                            }
                            if (data.type === 'run_update' && data.status === 'completed') {
                                log("Run completed signal received.");
                                return { runId, completed: true };
                            }
                        } catch (error) {
                            log(`Error parsing JSON: ${error}. Raw data: ${line.slice(5)}`);
                        }
                    }
                }
            }
        } catch (error) {
            log(`Error processing streamed response: ${error.message}`);
            throw error;
        }

        return { runId, completed: false };
    };

    const waitForRunCompletion = async (threadId, runId) => {
        log(`Waiting for run ${runId} to complete...`);
        while (true) {
            try {
                const response = await fetch(`${API_URL}/threads/${threadId}/runs/${runId}`, {
                    method: "GET",
                    headers: {
                        "Authorization": `Bearer ${API_KEY}`,
                        "OpenAI-Beta": "assistants=v2"
                    }
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`Error checking run status: ${response.status} - ${response.statusText}\n${errorText}`);
                }

                const runStatus = await response.json();
                
                if (runStatus.status === 'completed') {
                    return true;
                } else if (runStatus.status === 'failed') {
                    throw new Error(`Run failed: ${runStatus.last_error?.message || 'Unknown error'}`);
                }

                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (error) {
                log(`Error checking run status: ${error.message}`);
                throw error;
            }
        }
    };

    const fetchMessages = async (threadId) => {
        try {
            log(`Fetching messages for thread ${threadId}...`);
            const response = await fetch(`${API_URL}/threads/${threadId}/messages`, {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${API_KEY}`,
                    "OpenAI-Beta": "assistants=v2"
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Error fetching messages: ${response.status} - ${response.statusText}\n${errorText}`);
            }

            const data = await response.json();
            log(`Fetched ${data.data.length} messages.`);
            return data.data;
        } catch (error) {
            log(`Error fetching messages: ${error.message}`);
            throw error;
        }
    };

    const generate = async () => {
        log("Starting generation process...");
        if (!API_KEY || !assistantId || !userInput) {
            log("Error: Missing required fields.");
            instance.publishState('output', "Error: Please enter all required fields.");
            return;
        }

        try {
            if (!threadId) {
                threadId = await createThread();
                if (!threadId) {
                    throw new Error("Failed to create thread.");
                }
            } else {
                await addMessageToThread(threadId, userInput);
            }

            const runResponse = await createRun(threadId);
            const { runId, completed } = await processStreamedResponse(runResponse);

            if (!completed && runId) {
                await waitForRunCompletion(threadId, runId);
            }

            if (!output.trim()) {
                const messages = await fetchMessages(threadId);
                if (messages.length > 0) {
                    output = messages[0].content[0].text.value;
                    updateState();
                }
            }

            if (!output.trim()) {
                output = "Error: No response generated.";
                updateState();
            }

            const responseTime = (Date.now() - startTime) / 1000;
            instance.publishState('response_time', responseTime);
            instance.publishState('tokens', output.split(" ").length);
            
            if (instance.triggerEvent) {
                instance.triggerEvent('output_generation_completed');
            }
        } catch (error) {
            output = `Error: ${error.message}`;
            updateState();
            
            if (instance.triggerEvent) {
                instance.triggerEvent('output_generation_error');
            }
        }
    };

    generate();
}