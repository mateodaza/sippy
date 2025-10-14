/**
 * SIPPY - WhatsApp Payments with PYUSD
 * Landing page for the demo
 */

export default function HomePage() {
  return (
    <div className='min-h-screen bg-gradient-to-br from-green-50 to-blue-50'>
      <div className='container mx-auto px-4 py-8'>
        {/* Header */}
        <div className='text-center mb-12'>
          <h1 className='text-4xl md:text-6xl font-bold text-gray-900 mb-4'>
            💸 SIPPY
          </h1>
          <p className='text-xl md:text-2xl text-gray-600 mb-8'>
            Send money via WhatsApp using PYUSD
          </p>
          <div className='bg-white rounded-lg shadow-lg p-6 max-w-2xl mx-auto'>
            <h2 className='text-2xl font-semibold mb-4'>🚀 Demo Ready!</h2>
            <p className='text-gray-700 mb-4'>
              SIPPY allows users to create crypto wallets and send PYUSD
              directly through WhatsApp messages.
            </p>
            <div className='bg-green-100 border border-green-300 rounded-lg p-4'>
              <p className='text-green-800 font-medium'>
                ✅ Backend server running
                <br />
                ✅ CDP wallets working
                <br />✅ WhatsApp integration active
              </p>
            </div>
          </div>
        </div>

        {/* How it works */}
        <div className='grid md:grid-cols-3 gap-8 mb-12'>
          <div className='bg-white rounded-lg shadow-lg p-6 text-center'>
            <div className='text-4xl mb-4'>📱</div>
            <h3 className='text-xl font-semibold mb-2'>
              1. Send &ldquo;start&rdquo;
            </h3>
            <p className='text-gray-600'>
              Message our WhatsApp number to create your secure crypto wallet
              instantly
            </p>
          </div>

          <div className='bg-white rounded-lg shadow-lg p-6 text-center'>
            <div className='text-4xl mb-4'>💰</div>
            <h3 className='text-xl font-semibold mb-2'>2. Get your wallet</h3>
            <p className='text-gray-600'>
              Receive your wallet address and start receiving PYUSD
            </p>
          </div>

          <div className='bg-white rounded-lg shadow-lg p-6 text-center'>
            <div className='text-4xl mb-4'>🚀</div>
            <h3 className='text-xl font-semibold mb-2'>3. Send money</h3>
            <p className='text-gray-600'>
              Use &ldquo;send 5 to +57XXX&rdquo; to transfer PYUSD to other
              SIPPY users
            </p>
          </div>
        </div>

        {/* Commands */}
        <div className='bg-white rounded-lg shadow-lg p-8 mb-12'>
          <h2 className='text-2xl font-semibold mb-6 text-center'>
            📖 Available Commands
          </h2>
          <div className='grid md:grid-cols-2 gap-6'>
            <div className='bg-gray-50 rounded-lg p-4'>
              <code className='text-green-600 font-mono'>start</code>
              <p className='text-gray-700 mt-2'>Create your wallet</p>
            </div>
            <div className='bg-gray-50 rounded-lg p-4'>
              <code className='text-green-600 font-mono'>balance</code>
              <p className='text-gray-700 mt-2'>Check your PYUSD balance</p>
            </div>
            <div className='bg-gray-50 rounded-lg p-4'>
              <code className='text-green-600 font-mono'>
                send 10 to +57XXX
              </code>
              <p className='text-gray-700 mt-2'>Send money to friends</p>
            </div>
            <div className='bg-gray-50 rounded-lg p-4'>
              <code className='text-green-600 font-mono'>help</code>
              <p className='text-gray-700 mt-2'>Show all commands</p>
            </div>
          </div>
        </div>

        {/* Tech Stack */}
        <div className='bg-white rounded-lg shadow-lg p-8'>
          <h2 className='text-2xl font-semibold mb-6 text-center'>
            🛠️ Built With
          </h2>
          <div className='grid md:grid-cols-4 gap-4 text-center'>
            <div className='p-4'>
              <div className='text-3xl mb-2'>💬</div>
              <p className='font-semibold'>WhatsApp Cloud API</p>
            </div>
            <div className='p-4'>
              <div className='text-3xl mb-2'>🏦</div>
              <p className='font-semibold'>Coinbase CDP</p>
            </div>
            <div className='p-4'>
              <div className='text-3xl mb-2'>💎</div>
              <p className='font-semibold'>PYUSD</p>
            </div>
            <div className='p-4'>
              <div className='text-3xl mb-2'>⚡</div>
              <p className='font-semibold'>Arbitrum</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className='text-center mt-12'>
          <p className='text-gray-500'>
            Built for EthGlobal Hackathon 2024 • Made with ❤️
          </p>
        </div>
      </div>
    </div>
  );
}
