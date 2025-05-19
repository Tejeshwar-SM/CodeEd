import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

const Header = () => {
  const { user, logout, isAuthenticated } = useAuth();

  return (
    <header className="bg-indigo-700 text-white shadow-md">
      <div className="container mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center">
          <Link to="/" className="text-xl font-bold">CodeEdit</Link>
        </div>

        <nav className="space-x-4 flex items-center">
          {isAuthenticated ? (
            <>
              <Link to="/projects" className="hover:text-indigo-200">Projects</Link>
              <Link to="/settings" className="hover:text-indigo-200">Settings</Link>
              <span className="text-indigo-300">Welcome, {user?.username}</span>
              <button
                onClick={logout}
                className="bg-indigo-600 hover:bg-indigo-500 px-3 py-1 rounded"
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="hover:text-indigo-200">Login</Link>
              <Link to="/register" className="bg-indigo-600 hover:bg-indigo-500 px-3 py-1 rounded">
                Sign Up
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
};

export default Header;