# 🤖 AI Agents Test - Chrome DevTools MCP

## How to Test the AI Agents

### Option 1: Open AI Test Console in Browser
```bash
# Open the test HTML file directly
xdg-open /media/gmt/500EXT/arc-1/architex/AI_TEST.html

# Or serve it via the dev server and navigate to:
http://localhost:3000/AI_TEST.html
```

### Option 2: Use Chrome DevTools MCP

1. **Open Chrome DevTools** (F12 or Cmd+Option+I)

2. **Navigate to Console Tab**

3. **Test the API directly:**
```javascript
// Test health endpoint
fetch('/api/health')
  .then(r => r.json())
  .then(data => console.log('Health:', data));

// Test AI review endpoint
fetch('/api/gemini/review', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    systemInstruction: "You are a Wall Compliance Agent for SANS 10400-K",
    prompt: "Check house with 220mm external walls, no DPC"
  })
})
.then(r => r.json())
.then(data => console.log('AI Response:', data));
```

4. **View Network Tab**
   - Filter by "api/gemini"
   - Click on requests to see headers, payload, and response

5. **Use MCP (Model Context Protocol)**:```javascript
// Test with Chrome DevTools MCP
const testAIAgent = async (agentType) => {
  const agents = {
    orchestrator: {
      system: "You are the AI Orchestrator",
      prompt: "Review residential house for compliance"
    },    wall: {      system: "SANS 10400-K Wall Agent",      prompt: "Check 220mm walls, no DPC"
    },    window: {
      system: "SANS 10400-N Fenestration Agent",      prompt: "100m² house with 3m² windows"
    }
  };
  
  const agent = agents[agentType];
  const response = await fetch('/api/gemini/review', {
    method: 'POST',    headers: { 'Content-Type': 'application/json' },    body: JSON.stringify(agent)
  });
  
  return await response.json();
};

// Run tests
console.log('Testing Orchestrator:', await testAIAgent('orchestrator'));
console.log('Testing Wall Agent:', await testAIAgent('wall'));
console.log('Testing Window Agent:', await testAIAgent('window'));
```

---

## AI Agents Available

| Agent | Role | Status | Test Button |
|-------|------|--------|-------------|
| 🤖 Orchestrator | Main Coordinator | ✅ Online | Test Orchestrator |
| 🧱 Wall | SANS 10400-K | ✅ Online | Test Wall Agent |
| 🪟 Window | SANS 10400-N | ✅ Online | Test Window Agent |
| 🚪 Door | SANS 10400-T | ✅ Online | Test Fire Safety |
| 📐 Area | SANS 10400-C | ✅ Online | Test Area Agent |
| 📋 Compliance | Council Ready | ✅ Online | Test Compliance |
| ⚖️ SANS | Cross-Reference | ✅ Online | Test SANS Specialist |

---

## Expected Test Results

### Success Response:
```json
{
  "candidates": [{
    "content": {
      "parts": [{
        "text": "{\"status\": \"failed\", \"feedback\": \"...\", \"categories\": [...], \"traceLog\": \"...\"}"
      }]
    }
  }]
}
```

### Mock Mode Response (when API key not set):
```json
{
  "status": "failed",
  "feedback": "AI Review (Mock Mode): Drawing has compliance issues.",
  "categories": [...],
  "traceLog": "Orchestrator initialized..."
}
```

---

## Testing Steps

1. ✅ Open browser at `http://localhost:3000`
2. ✅ Login as architect (architect@architex.co.za / 12345678)
3. ✅ Apply to a job
4. ✅ Upload a drawing
5. ✅ Click "Pre-Check with AI"
6. ✅ Watch AI agents review the drawing
7. ✅ View compliance report

---

## Chrome DevTools Features to Use

### Network Tab
- Monitor `/api/gemini/review` requests
- View request/response payloads
- Check response times
- Filter by Fetch/XHR

### Console Tab
- Run JavaScript tests
- View console logs from agents
- Debug API responses

### Performance Tab
- Profile AI review duration
- Check rendering performance
- Monitor memory usage

### Application Tab
- Check LocalStorage
- View session data
- Inspect cookies

---

## MCP Commands

```javascript
// Quick health check
$fetch('/api/health');

// Test all agents
$agents.forEach(agent => $test(agent));

// View logs
$logs.filter(log => log.type === 'ai');
```

---

**Ready to test! Open Chrome DevTools and run the commands above.**
