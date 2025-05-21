import { useState, useEffect, useRef } from 'react';
import Button from '../ui/Button';
import { useWebSocket } from '../../contexts/useWebSocket';

const WebSocketTester = () => {
  const { isConnected, connectionStatus, connect, disconnect, sendMessage, reconnect } = useWebSocket();
  const [sessionId, setSessionId] = useState(`session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`);
  const [messages, setMessages] = useState([]);
  const [messageToSend, setMessageToSend] = useState('');
  const [jsonValid, setJsonValid] = useState(true);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    // Auto scroll to bottom when messages change
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Listen for WebSocket events
  useEffect(() => {
    const handleEvent = (eventName) => (data) => {
      const timestamp = new Date().toLocaleTimeString();
      setMessages(prev => [...prev, {
        type: 'received',
        timestamp,
        text: `${eventName}: ${JSON.stringify(data)}`
      }]);
    };

    // Register event listeners for the code execution service
    const codeExecutionService = require('../../services/codeExecutionService').default;

    const handlers = {
      output: handleEvent('output'),
      error: handleEvent('error'),
      inputPrompt: handleEvent('inputPrompt'),
      executionComplete: handleEvent('executionComplete'),
      executionTerminated: handleEvent('executionTerminated'),
      socketError: handleEvent('socketError'),
      connectionEstablished: handleEvent('connectionEstablished')
    };

    // Register all handlers
    Object.entries(handlers).forEach(([event, handler]) => {
      codeExecutionService.on(event, handler);
    });

    // Cleanup function
    return () => {
      // Unregister all handlers
      Object.entries(handlers).forEach(([event, handler]) => {
        codeExecutionService.off(event, handler);
      });
    };
  }, []);

  const handleConnect = () => {
    const timestamp = new Date().toLocaleTimeString();
    setMessages(prev => [...prev, {
      type: 'info',
      timestamp,
      text: `Attempting to connect with session ID: ${sessionId}`
    }]);

    connect();
  };

  const handleDisconnect = () => {
    const timestamp = new Date().toLocaleTimeString();
    setMessages(prev => [...prev, {
      type: 'info',
      timestamp,
      text: `Disconnecting from server`
    }]);

    disconnect();
  };

  const validateAndSendMessage = () => {
    let messageObj;
    try {
      messageObj = JSON.parse(messageToSend);
      setJsonValid(true);
    } catch (e) {
      setJsonValid(false);
      const timestamp = new Date().toLocaleTimeString();
      setMessages(prev => [...prev, {
        type: 'error',
        timestamp,
        text: `Invalid JSON: ${e.message}`
      }]);
      return;
    }

    const timestamp = new Date().toLocaleTimeString();
    setMessages(prev => [...prev, {
      type: 'sent',
      timestamp,
      text: `Sending: ${messageToSend}`
    }]);

    // Extract type from message object for sendMessage function
    const { type, ...data } = messageObj;
    const success = sendMessage(type, data);

    if (!success) {
      setMessages(prev => [...prev, {
        type: 'error',
        timestamp,
        text: 'Failed to send message (not connected)'
      }]);
    }

    setMessageToSend('');
  };

  const handleSampleMessage = (sample) => {
    setMessageToSend(JSON.stringify(sample, null, 2));
    setJsonValid(true);
  };

  return (
    <div className="p-4 bg-white border rounded-lg shadow-md">
      <h2 className="text-xl font-bold mb-4">WebSocket Tester</h2>

      <div className="mb-4 flex items-center">
        <div className={`h-3 w-3 rounded-full mr-2 ${
          isConnected ? 'bg-green-500' :
          connectionStatus === 'connecting' ? 'bg-yellow-500' :
          connectionStatus === 'error' ? 'bg-red-500' : 'bg-gray-500'
        }`}></div>
        <span className="text-sm font-medium">Status: {connectionStatus}</span>
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Session ID
        </label>
        <div className="flex">
          <input
            type="text"
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            className="flex-1 border rounded-md px-3 py-2 text-sm"
            disabled={isConnected}
          />
          {isConnected ? (
            <Button
              onClick={handleDisconnect}
              variant="danger"
              size="sm"
              className="ml-2"
            >
              Disconnect
            </Button>
          ) : (
            <Button
              onClick={handleConnect}
              variant="primary"
              size="sm"
              className="ml-2"
            >
              Connect
            </Button>
          )}

          {(connectionStatus === 'error' || connectionStatus === 'disconnected') && (
            <Button
              onClick={reconnect}
              variant="secondary"
              size="sm"
              className="ml-2"
            >
              Reconnect
            </Button>
          )}
        </div>
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Message
        </label>
        <textarea
          value={messageToSend}
          onChange={(e) => {
            setMessageToSend(e.target.value);
            try {
              if (e.target.value) {
                JSON.parse(e.target.value);
                setJsonValid(true);
              }
            } catch {
              setJsonValid(false);
            }
          }}
          className={`w-full border rounded-md px-3 py-2 h-32 font-mono text-sm ${!jsonValid ? 'border-red-500' : ''}`}
          placeholder='{"type": "execute", "code": "print(\'Hello World\')", "language": "python"}'
          disabled={!isConnected}
        />
        {!jsonValid && (
          <p className="text-red-500 text-xs mt-1">Invalid JSON format</p>
        )}
      </div>

      <div className="mb-4 flex justify-between">
        <Button
          onClick={validateAndSendMessage}
          disabled={!isConnected || !messageToSend || !jsonValid}
          variant="primary"
          size="sm"
        >
          Send Message
        </Button>

        <div className="space-x-2">
          <Button
            onClick={() => handleSampleMessage({
              type: 'execute',
              code: 'print("Hello World")',
              language: 'python'
            })}
            variant="outline"
            size="sm"
          >
            Python Example
          </Button>
          <Button
            onClick={() => handleSampleMessage({
              type: 'execute',
              code: 'console.log("Hello World");',
              language: 'js'
            })}
            variant="outline"
            size="sm"
          >
            JS Example
          </Button>
        </div>
      </div>

      <div className="mb-2 flex justify-between items-center">
        <h3 className="text-sm font-medium text-gray-700">Messages</h3>
        <Button
          onClick={() => setMessages([])}
          variant="ghost"
          size="sm"
        >
          Clear
        </Button>
      </div>

      <div className="border rounded bg-gray-50 p-2 h-64 overflow-y-auto font-mono text-xs">
        {messages.length === 0 ? (
          <div className="text-gray-500 italic">No messages yet</div>
        ) : (
          messages.map((message, index) => (
            <div
              key={index}
              className={`mb-1 ${
                message.type === 'error' ? 'text-red-600' :
                message.type === 'success' ? 'text-green-600' :
                message.type === 'received' ? 'text-blue-600' :
                message.type === 'sent' ? 'text-purple-600' :
                'text-gray-600'
              }`}
            >
              [{message.timestamp}] {message.text}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
};

export default WebSocketTester;