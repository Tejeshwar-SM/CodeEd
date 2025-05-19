import { Link } from 'react-router-dom';

const Sidebar = ({ isOpen, toggleSidebar }) => {
  return (
    <>
      <div
        className={`fixed inset-0 bg-black bg-opacity-50 z-20 lg:hidden ${isOpen ? 'block' : 'hidden'}`}
        onClick={toggleSidebar}
      ></div>

      <aside
        className={`
          fixed top-0 left-0 z-30 h-full w-64 bg-white shadow-lg transform transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 lg:static
        `}
      >
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold">Project Explorer</h2>
          <button
            className="lg:hidden absolute top-4 right-4 text-gray-600"
            onClick={toggleSidebar}
          >
            &times;
          </button>
        </div>

        <nav className="p-4">
          <ul className="space-y-2">
            <li>
              <Link
                to="/projects"
                className="block px-4 py-2 rounded-lg hover:bg-gray-100"
              >
                My Projects
              </Link>
            </li>
            <li>
              <Link
                to="/editor"
                className="block px-4 py-2 rounded-lg hover:bg-gray-100"
              >
                Editor
              </Link>
            </li>
            <li>
              <Link
                to="/settings"
                className="block px-4 py-2 rounded-lg hover:bg-gray-100"
              >
                Settings
              </Link>
            </li>
          </ul>
        </nav>
      </aside>
    </>
  );
};

export default Sidebar;