// src/services/codeExecutionService.js

class CodeExecutionService {
  constructor() {
    this.socket = null;
    this.sessionId = null;
    this.reconnectAttempts = 0;
    this.isReconnecting = false;
    this.maxReconnectAttempts = 3;
    this.handlers = {
      output: [],
      error: [],
      inputPrompt: [],
      executionComplete: [],
      executionTerminated: [],
      socketError: [],
      connectionEstablished: []
    };
  }

  setupWebSocket() {
    if (this.socket && this.socket.readyState === WebSocket.CONNECTING) {
      console.log("WebSocket connection already in progress");
      return this.socket;
    }

    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      console.log("WebSocket connection already open");
      return this.socket;
    }

    // Close any existing socket
    this.closeConnection();

    // Generate a unique session ID
    this.sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    console.log("Setting up new WebSocket connection with session ID:", this.sessionId);

    // Create new WebSocket connection
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = window.location.hostname === 'localhost' ? 'localhost:8000' : window.location.host;
    const wsUrl = `${wsProtocol}//${wsHost}/ws/code/${this.sessionId}/`;

    this.socket = new WebSocket(wsUrl);

    this.socket.onopen = () => {
      console.log('WebSocket connection established');
      this.reconnectAttempts = 0;
      this.isReconnecting = false;
      // Wait for the connection_established message from the server
    };

    this.socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('Received:', data);

        switch(data.type) {
          case 'connection_established':
            console.log('Connection confirmed by server');
            this._notifyHandlers('connectionEstablished', data);
            break;
          case 'output':
            this._notifyHandlers('output', data.output);
            break;
          case 'error':
            this._notifyHandlers('error', data.error);
            break;
          case 'input_prompt':
            this._notifyHandlers('inputPrompt');
            break;
          case 'execution_complete':
            this._notifyHandlers('executionComplete', data.exit_code);
            break;
          case 'execution_terminated':
            this._notifyHandlers('executionTerminated', data.message);
            break;
          default:
            console.log('Unknown message type:', data.type);
        }
      } catch (error) {
        console.error('Error handling message:', error);
        this._notifyHandlers('socketError', 'Error handling message from server');
      }
    };

    this.socket.onclose = (event) => {
      console.log('WebSocket connection closed', event);

      // Notify about unexpected closure during execution
      if (event.code !== 1000) { // 1000 is normal closure
        this._notifyHandlers('executionTerminated', 'Connection closed unexpectedly');
        this._notifyHandlers('socketError', `Connection closed: ${event.reason || 'Unknown reason'}`);

        // Only try to reconnect if it wasn't explicitly closed by our code
        if (!this.isReconnecting && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          this.isReconnecting = true;
          console.log(`Reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in 2 seconds...`);

          setTimeout(() => {
            this.isReconnecting = false;
            // We don't automatically reconnect, let the user try running code again
          }, 2000);
        }
      }
    };

    this.socket.onerror = (error) => {
      console.error('WebSocket error:', error);
      this._notifyHandlers('socketError', 'WebSocket connection error');
    };

    return this.socket;
  }

  executeCode(code, language, fileId) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.setupWebSocket();

      // Return a promise that resolves when the connection is established
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          this.off('connectionEstablished', connectionHandler);
          this.off('socketError', errorHandler);
          reject(new Error("WebSocket connection timeout"));
        }, 5000);

        const connectionHandler = () => {
          clearTimeout(timeout);
          this._executeCode(code, language, fileId);
          resolve();

          // Clean up event handlers after connection
          this.off('connectionEstablished', connectionHandler);
          this.off('socketError', errorHandler);
        };

        const errorHandler = (error) => {
          clearTimeout(timeout);
          this.off('connectionEstablished', connectionHandler);
          this.off('socketError', errorHandler);
          reject(new Error(error));
        };

        this.on('connectionEstablished', connectionHandler);
        this.on('socketError', errorHandler);
      });
    } else {
      this._executeCode(code, language, fileId);
      return Promise.resolve();
    }
  }

  _executeCode(code, language, fileId) {
    this.socket.send(JSON.stringify({
      type: 'execute',
      code: code,
      language: language,
      file_id: fileId
    }));
  }

  sendInput(input) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this._notifyHandlers('socketError', 'Cannot send input: not connected');
      return;
    }

    this.socket.send(JSON.stringify({
      type: 'input',
      input: input
    }));
  }

  terminateExecution() {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this._notifyHandlers('socketError', 'Cannot terminate: not connected');
      return;
    }

    this.socket.send(JSON.stringify({
      type: 'terminate'
    }));
  }

  on(eventType, handler) {
    if (!this.handlers[eventType]) {
      console.error(`Unknown event type: ${eventType}`);
      return this;
    }

    this.handlers[eventType].push(handler);
    return this;
  }

  off(eventType, handler) {
    if (!this.handlers[eventType]) {
      console.error(`Unknown event type: ${eventType}`);
      return this;
    }

    this.handlers[eventType] = this.handlers[eventType].filter(h => h !== handler);
    return this;
  }

  _notifyHandlers(eventType, data) {
    if (!this.handlers[eventType]) {
      return;
    }

    for (const handler of this.handlers[eventType]) {
      try {
        handler(data);
      } catch (err) {
        console.error(`Error in ${eventType} handler:`, err);
      }
    }
  }

  isConnected() {
    return this.socket && this.socket.readyState === WebSocket.OPEN;
  }

  closeConnection() {
    if (this.socket) {
      if (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING) {
        try {
          this.socket.close(1000, "Normal closure");
        } catch (e) {
          console.error("Error closing WebSocket:", e);
        }
      }
      this.socket = null;
    }
  }

  getSessionId() {
    return this.sessionId;
  }
}

// Export as singleton
const codeExecutionService = new CodeExecutionService();
export default codeExecutionService;