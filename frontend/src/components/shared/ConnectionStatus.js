import { useWebSocket } from '../../contexts/useWebSocket';

const ConnectionStatus = ({ showLabel = true, showReconnect = true }) => {
  const { connectionStatus, reconnect } = useWebSocket();

  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'connected': return 'bg-green-500';
      case 'connecting': return 'bg-yellow-500 animate-pulse';
      case 'error': return 'bg-red-500';
      case 'disconnected': return 'bg-gray-500';
      default: return 'bg-gray-300';
    }
  };

  const getStatusLabel = () => {
    switch (connectionStatus) {
      case 'connected': return 'Connected';
      case 'connecting': return 'Connecting...';
      case 'error': return 'Connection Error';
      case 'disconnected': return 'Disconnected';
      default: return 'Unknown';
    }
  };

  return (
    <div className="flex items-center">
      <div className={`h-3 w-3 rounded-full ${getStatusColor()}`}></div>

      {showLabel && (
        <span className="text-sm text-gray-600 ml-2">{getStatusLabel()}</span>
      )}

      {showReconnect && connectionStatus !== 'connected' && connectionStatus !== 'connecting' && (
        <button
          onClick={reconnect}
          className="ml-2 text-xs text-blue-600 hover:text-blue-800 hover:underline"
        >
          Reconnect
        </button>
      )}
    </div>
  );
};

export default ConnectionStatus;