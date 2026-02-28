/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
| Sippy routes will be wired in Phase 3.
|
*/

import router from '@adonisjs/core/services/router'

router.get('/', () => {
  return { hello: 'world' }
})

// TODO: Phase 3 — Wire all 18 Sippy routes here
// TODO: Phase 5 — Add admin dashboard routes
