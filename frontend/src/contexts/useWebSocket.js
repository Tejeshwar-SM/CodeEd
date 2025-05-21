import { createContext, useState, useEffect, useContext } from 'react';
import codeExecutionService from '../services/codeExecutionService';

// Create a WebSocket context
export const WebSocketContext = createContext({
  isConnected: false,
  connectionStatus: 'disconnected',
  connect: () => {},
  disconnect: () => {},
  sendMessage: () => {},
  reconnect: () => {},
});

export const WebSocketProvider = ({ children }) => {
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [socket, setSocket] = useState(null);

  // Initialize connection check interval
  useEffect(() => {
    const checkConnection = () => {
      const connected = codeExecutionService.isConnected();
      setConnectionStatus(connected ? 'connected' : 'disconnected');
    };

    // Check immediately and then set interval
    checkConnection();
    const interval = setInterval(checkConnection, 5000);

    return () => clearInterval(interval);
  }, []);

  // Initialize event listeners
  useEffect(() => {
    const handleSocketError = (err) => {
      console.error('Socket error:', err);
      setConnectionStatus('error');
    };

    const handleConnectionEstablished = () => {
      console.log('Connection established with server');
      setConnectionStatus('connected');
    };

    // Add event listeners
    codeExecutionService.on('socketError', handleSocketError);
    codeExecutionService.on('connectionEstablished', handleConnectionEstablished);

    return () => {
      // Remove event listeners
      codeExecutionService.off('socketError', handleSocketError);
      codeExecutionService.off('connectionEstablished', handleConnectionEstablished);
    };
  }, []);

  // Connect to WebSocket
  const connect = () => {
    if (connectionStatus !== 'disconnected' && connectionStatus !== 'error') {
      return;
    }

    setConnectionStatus('connecting');
    const newSocket = codeExecutionService.setupWebSocket();
    setSocket(newSocket);
  };

  // Disconnect from WebSocket
  const disconnect = () => {
    codeExecutionService.closeConnection();
    setConnectionStatus('disconnected');
    setSocket(null);
  };

  // Send a message via WebSocket
  const sendMessage = (messageType, data) => {
    if (!codeExecutionService.isConnected()) {
      console.error('Cannot send message - not connected');
      return false;
    }

    try {
      codeExecutionService.socket.send(JSON.stringify({
        type: messageType,
        ...data
      }));
      return true;
    } catch (error) {
      console.error('Error sending message:', error);
      return false;
    }
  };

  // Reconnect to WebSocket
  const reconnect = () => {
    disconnect();
    setTimeout(connect, 500); // Small delay before reconnecting
  };

  return (
    <WebSocketContext.Provider value={{
      isConnected: connectionStatus === 'connected',
      connectionStatus,
      connect,
      disconnect,
      sendMessage,
      reconnect,
    }}>
      {children}
    </WebSocketContext.Provider>
  );
};

// Custom hook to use WebSocket context
export const useWebSocket = () => useContext(WebSocketContext);