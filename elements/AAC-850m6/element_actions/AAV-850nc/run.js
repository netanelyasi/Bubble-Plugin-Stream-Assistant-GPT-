function(instance, properties, context) {
    // נקה את הפלט האחרון
    instance.publishState('output', '');
    
    // אפס את מונה הטוקנים
    instance.publishState('tokens', 0);
    
    // אפס את זמן התגובה
    instance.publishState('response_time', 0);
    
    // הוסף הודעת לוג
    const log = instance.data.log || [];
    log.push(`[${new Date().toISOString()}] Last output cleared`);
    instance.publishState('log', log.join('\n'));
    
    // שמור את הלוג המעודכן ב-instance.data
    instance.data.log = log;
    
    // הפעל אירוע שמציין שהפלט נוקה
    if (instance.triggerEvent) {
        instance.triggerEvent('output_cleared');
    }
}