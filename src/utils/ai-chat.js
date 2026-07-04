/**
 * Utility for handling AI Chat with Google Gemini API
 */

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent';

export class AIChatEngine {
  constructor() {
    this.apiKey = localStorage.getItem('gemini_api_key') || '';
    this.modelContext = {
      modelCount: 0,
      elementSummary: {},
      selectedElement: null
    };
    this.chatHistory = []; // Store past messages for context
    this.onCommand = null; // Callback for AI executing actions
  }

  setApiKey(key) {
    this.apiKey = key.trim();
    if (this.apiKey) {
      localStorage.setItem('gemini_api_key', this.apiKey);
    } else {
      localStorage.removeItem('gemini_api_key');
    }
  }

  hasApiKey() {
    return !!this.apiKey;
  }

  updateModelContext(summary) {
    this.modelContext.elementSummary = summary.types || {};
    this.modelContext.modelCount = summary.modelCount || 0;
  }

  updateSelectedElement(elementProperties) {
    this.modelContext.selectedElement = elementProperties;
  }

  _buildSystemPrompt() {
    let prompt = `You are a helpful BIM/IFC Model Copilot. You assist users in navigating and understanding their 3D building models.
You must answer questions based on the following real-time context of the user's loaded model.

=== MODEL SUMMARY ===
Total Loaded Models: ${this.modelContext.modelCount}
Element Counts by Type:
${Object.entries(this.modelContext.elementSummary).map(([type, count]) => `- ${type}: ${count}`).join('\n')}
`;

    if (this.modelContext.selectedElement) {
      prompt += `\n=== CURRENTLY SELECTED ELEMENT ===\n`;
      prompt += JSON.stringify(this.modelContext.selectedElement, null, 2);
    } else {
      prompt += `\n=== CURRENTLY SELECTED ELEMENT ===\nNone.`;
    }

    prompt += `\n\nInstructions:
1. Be concise. The user is in a chat interface.
2. If the user asks about the "selected" or "current" item, use the CURRENTLY SELECTED ELEMENT data.
3. If the user asks for counts (e.g., "how many doors"), use the MODEL SUMMARY data.
4. If you don't know the answer based on the context, politely explain what information you have available.

=== TOOL CALLING / COMMANDS ===
If the user asks you to perform an action on the model (e.g., highlight, hide, isolate elements), you MUST output a special JSON command exactly as follows, AND NOTHING ELSE in that message:
{"command": "highlight", "type": "IfcWall"}

Supported commands:
- "highlight": Highlights the specified elements.
- "hide": Hides the specified elements from view.
- "isolate": Hides everything else, showing ONLY the specified elements.
- "show_all": Restores visibility to everything (do not include "type" for this).

(Replace "IfcWall" with the appropriate IFC type based on the user's request. E.g., IfcDoor, IfcSlab, IfcWindow).`;

    return prompt;
  }

  async sendMessage(userMessage) {
    if (!this.apiKey) {
      throw new Error('API Key is missing.');
    }

    // Prepare contents
    const contents = [];
    
    // Add system prompt as a user message (Gemini API handles system instructions differently, but prepending it to the first message or using system_instruction works. We'll use system_instruction for gemini-1.5-flash).

    // Add chat history
    for (const msg of this.chatHistory) {
      contents.push({
        role: msg.role === 'bot' ? 'model' : 'user',
        parts: [{ text: msg.text }]
      });
    }

    // Add current message
    contents.push({
      role: 'user',
      parts: [{ text: userMessage }]
    });

    // Add user message to history
    this.chatHistory.push({ role: 'user', text: userMessage });

    const payload = {
      system_instruction: {
        parts: [{ text: this._buildSystemPrompt() }]
      },
      contents: contents,
      generationConfig: {
        temperature: 0.2
      }
    };

    try {
      const response = await fetch(`${GEMINI_API_URL}?key=${this.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to communicate with AI');
      }

      const data = await response.json();
      let botResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || "I'm sorry, I couldn't generate a response.";
      
      // Parse for command execution
      try {
        const potentialCommand = botResponse.trim();
        if (potentialCommand.startsWith('{') && potentialCommand.endsWith('}')) {
          const parsed = JSON.parse(potentialCommand);
          if (parsed.command && this.onCommand) {
            this.onCommand(parsed);
            botResponse = `Executing command: ${parsed.command} on ${parsed.type || 'elements'}`;
          }
        }
      } catch (e) {
        // Not JSON, ignore and return normal text
      }

      // Save bot response to history
      this.chatHistory.push({ role: 'bot', text: botResponse });
      
      return botResponse;
    } catch (error) {
      console.error('AI Chat Error:', error);
      throw error;
    }
  }
}
