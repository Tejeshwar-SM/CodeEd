// src/components/editor/FileOperationsBar.jsx
import Button from '../ui/Button';

const FileOperationsBar = ({ activeFile, onSave }) => {
  if (!activeFile) return null;

  return (
    <div className="flex items-center bg-gray-100 border-b px-4 py-1">
      <div className="text-sm text-gray-600">
        {activeFile.name}
      </div>
      <div className="ml-auto">
        <Button size="sm" variant="ghost" onClick={onSave}>
          Save
        </Button>
      </div>
    </div>
  );
};

export default FileOperationsBar;