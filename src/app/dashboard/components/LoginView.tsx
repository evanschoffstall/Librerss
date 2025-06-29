export const LoginView = () => (
  <div className="max-w-4xl mx-auto px-6 py-20">
    <div className="text-center mb-16">
      <h1 className="hero-title mb-8">Welcome Back</h1>
      <p className="hero-subtitle mb-12">Sign in to access your personalized RSS feeds</p>

      <div className="glass-card p-12 max-w-md mx-auto">
        <div className="space-y-6">
          <div className="space-y-4">
            <input
              type="email"
              placeholder="Email address"
              className="w-full p-4 bg-white/5 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:border-blue-400 focus:outline-none transition-colors duration-300"
            />
            <input
              type="password"
              placeholder="Password"
              className="w-full p-4 bg-white/5 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:border-blue-400 focus:outline-none transition-colors duration-300"
            />
          </div>

          <button className="w-full cta-button-primary">
            Sign In
          </button>

          <div className="text-center">
            <a href="#" className="text-blue-300 hover:text-blue-200 transition-colors duration-300">
              Forgot your password?
            </a>
          </div>
        </div>
      </div>
    </div>
  </div>
);
