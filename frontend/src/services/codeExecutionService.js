class CodeExecutionService {
  constructor() {
    this.socket = null;
    this.sessionId = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 3;
    this.reconnectTimeout = null;
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
    // Clear any existing connection first
    this.closeConnection();

    // Generate a unique session ID if not already set
    this.sessionId = this.sessionId || `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    console.log("Setting up WebSocket connection with session ID:", this.sessionId);

    // Create new WebSocket connection
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = window.location.hostname === 'localhost' ? 'localhost:8000' : window.location.host;
    const wsUrl = `${wsProtocol}//${wsHost}/ws/code/${this.sessionId}/`;

    try {
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        console.log('WebSocket connection established');
        this.reconnectAttempts = 0; // Reset reconnect counter on successful connection
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
          this._notifyHandlers('socketError', 'Error parsing message from server');
        }
      };

      this.socket.onclose = (event) => {
        console.log('WebSocket connection closed', event);

        // Notify about unexpected closure during execution
        this._notifyHandlers('executionTerminated', 'Connection closed unexpectedly');

        if (event.code !== 1000) { // 1000 is normal closure
          const reason = event.reason || 'Unknown reason';
          this._notifyHandlers('socketError', `Connection closed: ${reason}`);

          // Attempt to reconnect if appropriate
          this._handleReconnect();
        }
      };

      this.socket.onerror = (error) => {
        console.error('WebSocket error:', error);
        this._notifyHandlers('socketError', 'WebSocket connection error');
      };

      return this.socket;
    } catch (error) {
      console.error('Error creating WebSocket:', error);
      this._notifyHandlers('socketError', `Failed to create WebSocket: ${error.message}`);
      return null;
    }
  }

  _handleReconnect() {
    // Only attempt reconnect if not intentionally closed and under max attempts
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;

      // Exponential backoff
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 10000);

      console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${delay}ms`);

      this.reconnectTimeout = setTimeout(() => {
        this.setupWebSocket();
      }, delay);
    } else {
      console.log('Max reconnection attempts reached');
    }
  }

  executeCode(code, language, fileId) {
    if (!this.isConnected()) {
      console.log("No active connection, establishing new connection before execution");
      return new Promise((resolve, reject) => {
        const socket = this.setupWebSocket();

        if (!socket) {
          reject(new Error("Failed to create WebSocket connection"));
          return;
        }

        const timeout = setTimeout(() => {
          this.off('connectionEstablished', connectionHandler);
          this.off('socketError', errorHandler);
          reject(new Error("WebSocket connection timeout"));
        }, 5000);

        const connectionHandler = () => {
          clearTimeout(timeout);
          this.off('connectionEstablished', connectionHandler);
          this.off('socketError', errorHandler);

          this._executeCode(code, language, fileId);
          resolve();
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
    try {
      if (!this.isConnected()) {
        throw new Error("WebSocket not connected");
      }

      this.socket.send(JSON.stringify({
        type: 'execute',
        code: code,
        language: language,
        file_id: fileId
      }));
    } catch (error) {
      console.error("Error sending execution request:", error);
      this._notifyHandlers('socketError', `Failed to send execution request: ${error.message}`);
    }
  }

  sendInput(input) {
    if (!this.isConnected()) {
      this._notifyHandlers('socketError', 'Cannot send input: not connected');
      return;
    }

    try {
      this.socket.send(JSON.stringify({
        type: 'input',
        input: input
      }));
    } catch (error) {
      this._notifyHandlers('socketError', `Failed to send input: ${error.message}`);
    }
  }

  terminateExecution() {
    if (!this.isConnected()) {
      this._notifyHandlers('socketError', 'Cannot terminate: not connected');
      return;
    }

    try {
      this.socket.send(JSON.stringify({
        type: 'terminate'
      }));
    } catch (error) {
      this._notifyHandlers('socketError', `Failed to terminate execution: ${error.message}`);
    }
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
    // Clear any pending reconnect attempts
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    // Close socket if it exists and isn't already closed
    if (this.socket && this.socket.readyState !== WebSocket.CLOSED) {
      try {
        // Use a clean close
        this.socket.close(1000, "Closed by client");
      } catch (error) {
        console.error("Error closing WebSocket:", error);
      } finally {
        this.socket = null;
      }
    }
  }
}

// Export as singleton
const codeExecutionService = new CodeExecutionService();
export default codeExecutionService;