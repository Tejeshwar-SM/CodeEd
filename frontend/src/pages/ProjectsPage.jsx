// src/pages/ProjectsPage.jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { projects } from '../services/api';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import ProjectCard from '../components/projects/ProjectCard';
import Loader from '../components/ui/Loader';

const ProjectsPage = () => {
const [projectsList, setProjectsList] = useState([]);
const [loading, setLoading] = useState(true);
const [error, setError] = useState(null);
const [showModal, setShowModal] = useState(false);
const [newProject, setNewProject] = useState({ name: '', description: '' });
const navigate = useNavigate();

const fetchProjects = async () => {
  try {
    setLoading(true);
    const response = await projects.getAll();
    // Check if response.data is paginated (has 'results' property)
    setProjectsList(response.data.results || response.data);
    setError(null);
  } catch (err) {
    console.error('Error fetching projects:', err);
    setError('Failed to load projects. Please try again.');
  } finally {
    setLoading(false);
  }
};

useEffect(() => {
  fetchProjects();
}, []);

const handleCreateProject = async () => {
  try {
    if (!newProject.name.trim()) {
      return;
    }

    const response = await projects.create(newProject);
    setProjectsList([...projectsList, response.data]);
    setNewProject({ name: '', description: '' });
    setShowModal(false);
  } catch (err) {
    console.error('Error creating project:', err);
    setError('Failed to create project. Please try again.');
  }
};

const handleDeleteProject = async (id) => {
  try {
    await projects.delete(id);
    setProjectsList(projectsList.filter(project => project.id !== id));
  } catch (err) {
    console.error('Error deleting project:', err);
    setError('Failed to delete project. Please try again.');
  }
};

const handleOpenEditor = (projectId) => {
  navigate(`/editor/${projectId}`);
};

return (
  <div className="container mx-auto px-4 py-8">
    <div className="flex justify-between items-center mb-8">
      <h1 className="text-3xl font-bold">My Projects</h1>
      <Button onClick={() => setShowModal(true)}>Create New Project</Button>
    </div>

    {error && (
      <div className="bg-red-100 text-red-700 p-4 rounded-md mb-6">
        {error}
      </div>
    )}

    {loading ? (
      <div className="flex justify-center py-12">
        <Loader size="lg" />
      </div>
    ) : projectsList.length === 0 ? (
      <div className="text-center py-12 bg-gray-50 rounded-lg">
        <h3 className="text-xl font-medium text-gray-600 mb-4">No projects yet</h3>
        <p className="text-gray-500 mb-6">Create your first project to get started</p>
        <Button onClick={() => setShowModal(true)}>Create Project</Button>
      </div>
    ) : (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {projectsList.map(project => (
          <ProjectCard
            key={project.id}
            project={project}
            onDelete={() => handleDeleteProject(project.id)}
            onOpen={() => handleOpenEditor(project.id)}
          />
        ))}
      </div>
    )}

    {/* Create Project Modal */}
    <Modal
      isOpen={showModal}
      onClose={() => setShowModal(false)}
      title="Create New Project"
    >
      <div className="space-y-4">
        <div>
          <label className="block text-gray-700 mb-2" htmlFor="name">
            Project Name
          </label>
          <input
            id="name"
            type="text"
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
            value={newProject.name}
            onChange={(e) => setNewProject({...newProject, name: e.target.value})}
            placeholder="My Awesome Project"
          />
        </div>

        <div>
          <label className="block text-gray-700 mb-2" htmlFor="description">
            Description (Optional)
          </label>
          <textarea
            id="description"
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
            value={newProject.description}
            onChange={(e) => setNewProject({...newProject, description: e.target.value})}
            placeholder="Project description..."
            rows="3"
          ></textarea>
        </div>

        <div className="flex justify-end space-x-3 pt-4">
          <Button variant="ghost" onClick={() => setShowModal(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreateProject}>
            Create Project
          </Button>
        </div>
      </div>
    </Modal>
  </div>
);
};

export default ProjectsPage;