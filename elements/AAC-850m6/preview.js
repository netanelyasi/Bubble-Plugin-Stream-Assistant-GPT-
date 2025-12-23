function(instance, properties) {
    var styledHtml = `
        <div style="
            background: #f7f9fc;
            padding: 20px;
            text-align: center;
            color: #34495e;
            border-radius: 10px;
            box-shadow: 0 4px 8px rgba(0,0,0,0.1);
            font-family: Arial, sans-serif;
            font-size: 16px;
            max-width: 100%;
            max-height: 100%;
            margin: auto;
        ">
            <strong>Stream Assistant GPT 🤖</strong><br>
            <small>by Netanelyasi</small>
        </div>
    `;

    $(instance.canvas).html(styledHtml);
}
