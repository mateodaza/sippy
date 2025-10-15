/**
 * SIPPY - WhatsApp Digital Assistant
 * Clean, centered landing page
 */

export default function HomePage() {
  return (
    <div className='min-h-screen bg-gradient-to-br from-green-50 via-blue-50 to-purple-50'>
      <div className='container mx-auto px-6 py-16 max-w-6xl'>
        
        {/* Header */}
        <div className='text-center mb-24'>
          <h1 className='text-7xl md:text-8xl font-black bg-clip-text text-transparent bg-gradient-to-r from-green-500 to-blue-500 mb-4'>
            SIPPY
          </h1>
          <div className='text-5xl mb-6'>💬</div>
          <p className='text-3xl md:text-4xl text-gray-900 mb-6 font-bold'>
            Your Smart WhatsApp Assistant
          </p>
          <p className='text-xl text-gray-600 max-w-3xl mx-auto'>
            Connect, communicate, and manage your digital services through WhatsApp.
            <br />
            <span className='text-green-600 font-semibold'>Simple, secure, and available to everyone.</span>
          </p>
        </div>

        {/* How it works */}
        <div className='mb-24'>
          <h2 className='text-4xl md:text-5xl font-bold text-center mb-16 text-gray-900'>
            How It Works
          </h2>
          <div className='grid md:grid-cols-3 gap-8'>
            <div className='text-center'>
              <div className='bg-white rounded-2xl shadow-lg p-8 hover:shadow-xl transition-all duration-300 h-full flex flex-col items-center justify-center'>
                <div className='text-6xl mb-6'>📱</div>
                <h3 className='text-2xl font-bold mb-4 text-gray-900'>1. Connect</h3>
                <p className='text-gray-600'>
                  Send "start" to our WhatsApp number
                </p>
              </div>
            </div>

            <div className='text-center'>
              <div className='bg-white rounded-2xl shadow-lg p-8 hover:shadow-xl transition-all duration-300 h-full flex flex-col items-center justify-center'>
                <div className='text-6xl mb-6'>🔐</div>
                <h3 className='text-2xl font-bold mb-4 text-gray-900'>2. Setup</h3>
                <p className='text-gray-600'>
                  Get your secure account instantly
                </p>
              </div>
            </div>

            <div className='text-center'>
              <div className='bg-white rounded-2xl shadow-lg p-8 hover:shadow-xl transition-all duration-300 h-full flex flex-col items-center justify-center'>
                <div className='text-6xl mb-6'>🚀</div>
                <h3 className='text-2xl font-bold mb-4 text-gray-900'>3. Use</h3>
                <p className='text-gray-600'>
                  Access services through messages
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Features */}
        <div className='mb-24'>
          <h2 className='text-4xl md:text-5xl font-bold text-center mb-16 text-gray-900'>
            Why Choose SIPPY?
          </h2>
          <div className='grid md:grid-cols-4 gap-6'>
            <div className='text-center'>
              <div className='bg-white rounded-xl shadow-md p-6 hover:shadow-lg transition-all duration-300 h-full flex flex-col items-center'>
                <div className='text-5xl mb-4'>🔒</div>
                <h3 className='text-xl font-bold mb-3 text-gray-900'>Secure</h3>
                <p className='text-gray-600 text-sm'>Enterprise-grade encryption</p>
              </div>
            </div>

            <div className='text-center'>
              <div className='bg-white rounded-xl shadow-md p-6 hover:shadow-lg transition-all duration-300 h-full flex flex-col items-center'>
                <div className='text-5xl mb-4'>⚡</div>
                <h3 className='text-xl font-bold mb-3 text-gray-900'>Instant</h3>
                <p className='text-gray-600 text-sm'>Real-time responses 24/7</p>
              </div>
            </div>

            <div className='text-center'>
              <div className='bg-white rounded-xl shadow-md p-6 hover:shadow-lg transition-all duration-300 h-full flex flex-col items-center'>
                <div className='text-5xl mb-4'>🤖</div>
                <h3 className='text-xl font-bold mb-3 text-gray-900'>Smart</h3>
                <p className='text-gray-600 text-sm'>AI-powered automation</p>
              </div>
            </div>

            <div className='text-center'>
              <div className='bg-white rounded-xl shadow-md p-6 hover:shadow-lg transition-all duration-300 h-full flex flex-col items-center'>
                <div className='text-5xl mb-4'>📱</div>
                <h3 className='text-xl font-bold mb-3 text-gray-900'>Simple</h3>
                <p className='text-gray-600 text-sm'>No app download needed</p>
              </div>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className='mb-20 max-w-3xl mx-auto'>
          <div className='bg-gradient-to-r from-green-500 to-blue-500 rounded-3xl shadow-xl p-16 text-center text-white'>
            <h2 className='text-4xl md:text-5xl font-bold mb-6'>
              Ready to Get Started?
            </h2>
            <p className='text-xl md:text-2xl mb-10'>
              Join our growing community
            </p>
            <div className='bg-white rounded-2xl p-8 inline-block shadow-lg'>
              <p className='text-gray-600 font-medium mb-2 text-lg'>Launching Soon</p>
              <p className='text-5xl font-black bg-clip-text text-transparent bg-gradient-to-r from-green-500 to-blue-500'>
                SIPPY
              </p>
              <p className='text-gray-500 text-sm mt-3'>Stay tuned for updates</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className='text-center text-gray-500 space-y-4 pb-12 pt-8 border-t border-gray-200'>
          <div className='flex justify-center space-x-6 text-sm'>
            <a href='#' className='hover:text-gray-900 transition-colors'>About</a>
            <a href='#' className='hover:text-gray-900 transition-colors'>Privacy</a>
            <a href='#' className='hover:text-gray-900 transition-colors'>Terms</a>
            <a href='#' className='hover:text-gray-900 transition-colors'>Contact</a>
          </div>
          <p className='text-sm text-gray-700'>
            © 2025 SIPPY. All rights reserved.
          </p>
        </footer>

      </div>
    </div>
  );
}
