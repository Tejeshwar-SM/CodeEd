// src/pages/HomePage.jsx
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import Button from '../components/ui/Button';

const HomePage = () => {
  const { isAuthenticated } = useAuth();

  return (
    <div className="bg-gradient-to-b from-indigo-50 to-white">
      {/* Hero Section */}
      <div className="container mx-auto px-4 py-16 md:py-24">
        <div className="flex flex-col md:flex-row items-center">
          <div className="md:w-1/2 md:pr-10">
            <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
              Code Anywhere, Anytime
            </h1>
            <p className="text-lg text-gray-700 mb-8">
              A powerful online code editor with real-time syntax highlighting,
              multiple language support, and collaborative features to make coding easier.
            </p>
            {isAuthenticated ? (
              <Link to="/projects">
                <Button size="lg">Go to My Projects</Button>
              </Link>
            ) : (
              <div className="flex space-x-4">
                <Link to="/register">
                  <Button size="lg">Get Started</Button>
                </Link>
                <Link to="/login">
                  <Button variant="outline" size="lg">Sign In</Button>
                </Link>
              </div>
            )}
          </div>
          <div className="md:w-1/2 mt-10 md:mt-0">
            <div className="bg-white p-4 rounded-xl shadow-lg">
              {/* Mock code editor image/component */}
              <div className="bg-gray-900 rounded-md p-4 text-white font-mono text-sm overflow-hidden">
                <div className="flex mb-4 items-center">
                  <div className="h-3 w-3 rounded-full bg-red-500 mr-2"></div>
                  <div className="h-3 w-3 rounded-full bg-yellow-500 mr-2"></div>
                  <div className="h-3 w-3 rounded-full bg-green-500"></div>
                </div>
                <pre className="text-blue-400">import <span className="text-green-400">React</span> from <span className="text-yellow-300">'react'</span>;</pre>
                <pre className="text-blue-400">import <span className="text-green-400">ReactDOM</span> from <span className="text-yellow-300">'react-dom'</span>;</pre>
                <pre></pre>
                <pre className="text-purple-400">function <span className="text-yellow-300">App</span>() {'{'}</pre>
                <pre className="ml-4">return (</pre>
                <pre className="ml-8 text-blue-300">{'<div>'}</pre>
                <pre className="ml-12 text-blue-300">{'<h1>'}<span className="text-white">Hello, CodeEditor!</span>{'</h1>'}</pre>
                <pre className="ml-12 text-blue-300">{'<p>'}<span className="text-white">Start coding now</span>{'</p>'}</pre>
                <pre className="ml-8 text-blue-300">{'</div>'}</pre>
                <pre className="ml-4">);</pre>
                <pre className="text-purple-400">{'}'}</pre>
                <pre></pre>
                <pre className="text-white">ReactDOM.render(<span className="text-blue-300">{'<App />'}</span>, document.getElementById(<span className="text-yellow-300">'root'</span>));</pre>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="container mx-auto px-4 py-16 border-t border-gray-100">
        <h2 className="text-3xl font-bold text-center mb-12">Key Features</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="bg-white p-6 rounded-lg shadow-md">
            <div className="text-indigo-600 mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
            </div>
            <h3 className="font-bold text-xl mb-2">Multi-language Support</h3>
            <p className="text-gray-600">Write code in JavaScript, Python, HTML/CSS, and many more languages with syntax highlighting.</p>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-md">
            <div className="text-indigo-600 mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </div>
            <h3 className="font-bold text-xl mb-2">Project Management</h3>
            <p className="text-gray-600">Create multiple projects and organize your files efficiently with our intuitive interface.</p>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-md">
            <div className="text-indigo-600 mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
              </svg>
            </div>
            <h3 className="font-bold text-xl mb-2">Cloud Storage</h3>
            <p className="text-gray-600">Access your code from anywhere. Your projects are safely stored in the cloud.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HomePage;