class CodeExecutionService {
  constructor() {
    this.socket = null;
    this.sessionId = null;
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
    // Generate a unique session ID
    this.sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.log("Setting up new WebSocket connection with session ID:", this.sessionId);

    // Create new WebSocket connection
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = window.location.hostname === 'localhost' ? 'localhost:8000' : window.location.host;
    const wsUrl = `${wsProtocol}//${wsHost}/ws/code/${this.sessionId}/`;

    this.socket = new WebSocket(wsUrl);

    this.socket.onopen = () => {
      console.log('WebSocket connection established');
      // Wait for the connection_established message from the server
    };

    this.socket.onmessage = (event) => {
      try {
        console.log('Received:', event.data);
        const data = JSON.parse(event.data);

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
      this._notifyHandlers('executionTerminated', 'Connection closed unexpectedly');

      // Notify about socket errors
      if (event.code !== 1000) { // 1000 is normal closure
        this._notifyHandlers('socketError', `Connection closed: ${event.reason || 'Unknown reason'}`);
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

      // We'll return a promise that resolves when the connection is established
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("WebSocket connection timeout"));
        }, 5000);

        const connectionHandler = () => {
          clearTimeout(timeout);
          this._executeCode(code, language, fileId);
          resolve();
        };

        const errorHandler = (error) => {
          clearTimeout(timeout);
          reject(new Error(error));
        };

        this.on('connectionEstablished', connectionHandler);
        this.on('socketError', errorHandler);

        // Clean up event handlers after connection or error
        setTimeout(() => {
          this.off('connectionEstablished', connectionHandler);
          this.off('socketError', errorHandler);
        }, 6000);
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
    if (this.socket && this.socket.readyState !== WebSocket.CLOSED) {
      this.socket.close();
      this.socket = null;
    }
  }
}

// Export as singleton
const codeExecutionService = new CodeExecutionService();
export default codeExecutionService;