import { useRef, useEffect } from 'react';
import Button from '../ui/Button';

const Terminal = ({
  terminalOutput,
  isRunning,
  waitingForInput,
  userInput,
  setUserInput,
  connectionStatus,
  handleInputKeyDown,
  stopExecution,
  clearTerminal,
  reconnectToService
}) => {
  const terminalRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll terminal to bottom
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [terminalOutput]);

  // Focus input when waiting for input
  useEffect(() => {
    if (waitingForInput && inputRef.current) {
      inputRef.current.focus();
    }
  }, [waitingForInput]);

  const getConnectionStatusText = () => {
    switch (connectionStatus) {
      case 'connected': return isRunning ? 'Running...' : 'Ready';
      case 'connecting': return 'Connecting...';
      case 'error': return 'Connection error';
      case 'disconnected': return 'Disconnected';
      default: return 'Terminal';
    }
  };

  const getStatusClass = () => {
    switch (connectionStatus) {
      case 'connected': return 'text-green-500';
      case 'connecting': return 'text-yellow-500';
      case 'error': return 'text-red-500';
      case 'disconnected': return 'text-gray-500';
      default: return '';
    }
  };

  const sendInput = () => {
    if (!userInput.trim()) return;
    handleInputKeyDown({ key: 'Enter', preventDefault: () => {} });
  };

  return (
    <div className="terminal-panel">
      <div className="terminal-toolbar">
        <div className="flex items-center">
          <span className={`terminal-status ${getStatusClass()}`}>
            {getConnectionStatusText()}
          </span>
          {connectionStatus !== 'connected' && (
            <Button
              onClick={reconnectToService}
              variant="secondary"
              size="sm"
              className="ml-2"
            >
              Reconnect
            </Button>
          )}
        </div>
        <div>
          {isRunning && (
            <Button
              onClick={stopExecution}
              variant="danger"
              size="sm"
              className="mr-2"
            >
              Stop
            </Button>
          )}
          <Button
            onClick={clearTerminal}
            variant="ghost"
            size="sm"
          >
            Clear
          </Button>
        </div>
      </div>

      <div className="terminal-output" ref={terminalRef}>
        {terminalOutput.map((line, i) => (
          <p
            key={i}
            className={`terminal-line terminal-line-${line.type}`}
          >
            {line.text}
          </p>
        ))}
      </div>

      {isRunning && (
        <div className={`terminal-input-area ${waitingForInput ? 'terminal-waiting-input' : ''}`}>
          <span className="terminal-input-prompt">
            {waitingForInput ? ">" : ""}
          </span>
          <input
            type="text"
            ref={inputRef}
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            onKeyDown={handleInputKeyDown}
            disabled={!waitingForInput || connectionStatus !== 'connected'}
            className="terminal-input"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck="false"
          />
          {waitingForInput && userInput && (
            <button
              onClick={sendInput}
              className="ml-2 px-2 py-1 bg-blue-500 text-white rounded text-xs"
            >
              Send
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default Terminal;