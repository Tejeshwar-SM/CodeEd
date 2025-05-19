import { useState } from 'react';
import Button from '../ui/Button';
import { formatDistanceToNow } from 'date-fns';

const FileExplorer = ({
  files,
  activeFileId,
  onFileSelect,
  onCreateFile,
  onDeleteFile,
  onRenameFile,
  projectName
}) => {
  const [newFileName, setNewFileName] = useState('');
  const [showNewFileInput, setShowNewFileInput] = useState(false);
  const [fileToRename, setFileToRename] = useState(null);
  const [newFileNameForRename, setNewFileNameForRename] = useState('');

  const handleCreateFile = () => {
    if (!newFileName.trim()) return;

    onCreateFile(newFileName);
    setNewFileName('');
    setShowNewFileInput(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleCreateFile();
    } else if (e.key === 'Escape') {
      setShowNewFileInput(false);
      setNewFileName('');
    }
  };

  const handleRenameKeyDown = (e, file) => {
    if (e.key === 'Enter') {
      handleRenameSubmit(file);
    } else if (e.key === 'Escape') {
      setFileToRename(null);
    }
  };

  const handleRenameSubmit = (file) => {
    if (newFileNameForRename && newFileNameForRename !== file.name) {
      onRenameFile(file.id, newFileNameForRename);
    }
    setFileToRename(null);
  };

  const startRenameFile = (e, file) => {
    e.stopPropagation();
    setFileToRename(file.id);
    setNewFileNameForRename(file.name);
  };

  // Group files by extension
  const groupedFiles = (Array.isArray(files) ? files : []).reduce((acc, file) => {
    const ext = file.name.split('.').pop() || 'other';
    if (!acc[ext]) {
      acc[ext] = [];
    }
    acc[ext].push(file);
    return acc;
  }, {});

  return (
    <div className="flex flex-col h-full">
      <div className="border-b p-4">
        <h3 className="font-medium mb-2">{projectName}</h3>
        <Button
          onClick={() => setShowNewFileInput(true)}
          className="w-full"
          size="sm"
        >
          + New File
        </Button>

        {showNewFileInput && (
          <div className="mt-2">
            <input
              type="text"
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="File name"
              className="w-full px-2 py-1 border rounded text-sm"
              autoFocus
            />
          </div>
        )}
      </div>

      <div className="overflow-y-auto flex-1 py-2">
        {Object.entries(groupedFiles).map(([ext, fileGroup]) => (
          <div key={ext} className="mb-4">
            <div className="text-xs uppercase text-gray-500 font-semibold px-4 mb-1">
              {ext}
            </div>
            <ul>
              {fileGroup.map((file) => (
                <li
                  key={file.id}
                  className={`flex items-center justify-between px-4 py-1 cursor-pointer hover:bg-gray-200 ${
                    file.id === activeFileId ? 'bg-blue-100' : ''
                  }`}
                  onClick={() => onFileSelect(file)}
                >
                  {fileToRename === file.id ? (
                    <input
                      type="text"
                      value={newFileNameForRename}
                      onChange={(e) => setNewFileNameForRename(e.target.value)}
                      onKeyDown={(e) => handleRenameKeyDown(e, file)}
                      onBlur={() => handleRenameSubmit(file)}
                      className="flex-1 px-1 py-0 border rounded text-sm"
                      autoFocus
                    />
                  ) : (
                    <span className="flex-1 truncate">{file.name}</span>
                  )}

                  <div className="flex space-x-1">
                    {file.id === activeFileId && (
                      <>
                        <button
                          className="text-gray-500 hover:text-gray-700 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            onFileSelect(null);
                          }}
                          title="Close file"
                        >
                          ✕
                        </button>
                        <button
                          className="text-gray-500 hover:text-gray-700 text-xs"
                          onClick={(e) => startRenameFile(e, file)}
                          title="Rename file"
                        >
                          ✏️
                        </button>
                        <button
                          className="text-gray-500 hover:text-gray-700 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteFile(file.id);
                          }}
                          title="Delete file"
                        >
                          🗑️
                        </button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}

        {files.length === 0 && (
          <div className="text-gray-500 text-center py-4">
            No files yet. Create one to get started.
          </div>
        )}
      </div>
    </div>
  );
};

export default FileExplorer;