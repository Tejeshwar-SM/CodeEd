// src/components/projects/ProjectCard.jsx
import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import Button from '../ui/Button';
import Modal from '../ui/Modal';

const ProjectCard = ({ project, onDelete, onOpen }) => {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const { id, name, description, created_at, updated_at, files = [] } = project;

  const formattedDate = (date) => {
    return formatDistanceToNow(new Date(date), { addSuffix: true });
  };

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow duration-300">
      <div className="px-6 py-5 border-b border-gray-100">
        <h3 className="text-xl font-semibold text-gray-800 mb-1 truncate">{name}</h3>
        <p className="text-gray-500 text-sm">
          Updated {formattedDate(updated_at)}
        </p>
      </div>

      <div className="px-6 py-4">
        {description ? (
          <p className="text-gray-600 mb-3 text-sm line-clamp-2">{description}</p>
        ) : (
          <p className="text-gray-400 italic mb-3 text-sm">No description</p>
        )}

        <div className="flex items-center text-sm text-gray-500">
          <span>{files.length} file{files.length !== 1 ? 's' : ''}</span>
          <span className="mx-2">•</span>
          <span>Created {formattedDate(created_at)}</span>
        </div>
      </div>

      <div className="px-6 py-3 bg-gray-50 flex justify-between">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowDeleteModal(true)}
        >
          Delete
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={() => onOpen(id)}
        >
          Open Editor
        </Button>
      </div>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Confirm Delete"
      >
        <div>
          <p className="text-gray-700 mb-4">
            Are you sure you want to delete <strong>{name}</strong>? This action cannot be undone.
          </p>
          <div className="flex justify-end space-x-3">
            <Button
              variant="ghost"
              onClick={() => setShowDeleteModal(false)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                onDelete(id);
                setShowDeleteModal(false);
              }}
            >
              Delete Project
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default ProjectCard;