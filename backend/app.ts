import { Hono } from 'https://deno.land/x/hono@v3.11.12/mod.ts'

const app = new Hono()

app.get('/', c => {
  return c.text('this is a proxy')
})

app.get('/proxy', async (c, next) => {
  await next()
  console.log('finished')
}, async c => {
  const url = c.req.query('url')
  if (!url) {
    return c.text('no url provided')
  }

  let headers = {
    'Access-Control-Allow-Origin': '*',
  }

  const response = await fetch(url, {
    method: 'HEAD',
    headers
  })

  const content_length = response.headers.get('Content-Length')

  if (response.headers.get('Content-Type') == 'audio/mpeg') headers['Content-Length'] = content_length

  return new Response((await fetch(url, { headers })).body, {
    headers
  })
})

Deno.serve(app.fetch)