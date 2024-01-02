import { Context, Hono } from 'https://deno.land/x/hono@v3.11.12/mod.ts'
import { html } from 'https://deno.land/x/hono@v3.11.12/helper.ts'
import { HtmlEscapedString } from 'https://deno.land/x/hono@v3.11.12/utils/html.ts';
import 'https://deno.land/std@0.210.0/dotenv/load.ts'

const app = new Hono()

type LayoutProps = {
  head?: HtmlEscapedString | Promise<HtmlEscapedString>,
  children: HtmlEscapedString | Promise<HtmlEscapedString>,
  foot?: HtmlEscapedString | Promise<HtmlEscapedString>
}

const MasterLayout = (props: LayoutProps) => html`<!DOCTYPE html>
  <html lang="en" data-bs-theme="dark">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Pretty Proxy</title>
    <link href="https://fonts.googleapis.com/css?family=Roboto:100,300,400,500,700,900|Material+Icons" rel="stylesheet" type="text/css">
    <link href="https://cdn.jsdelivr.net/npm/quasar@2.14.2/dist/quasar.prod.css" rel="stylesheet" type="text/css">
    <script src="https://cdn.jsdelivr.net/npm/vue@3/dist/vue.global.prod.js" defer></script>
    <script src="https://cdn.jsdelivr.net/npm/quasar@2.14.2/dist/quasar.umd.prod.js" defer></script>
    ${ props.head }
  </head>
  <body>
    ${ props.children }
    ${ props.foot }
  </body>
  </html>
`

const PublicLayout = (props: LayoutProps) => MasterLayout({
  head: props.head,
  children: html`<div class="container">
    ${ props.children }
  </div>`,
  foot: props.foot
})

const wsConnections: WebSocket[] = []

app.get('/proxy', async c => {
  const url = c.req.query('url')

  if (!url) {
    return c.text('no url provided')
  }

  if (wsConnections.length > 0) {

    for (let connection of wsConnections) {
      connection.send(JSON.stringify({
        url,
        ip: c.env.clientIp,
        accessed: new Date().toISOString()
      }))
    }

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

app.get('/updates', async (c) => {
  const { response, socket } = Deno.upgradeWebSocket(c.req.raw)
  
  wsConnections.push(socket)

  return response
})

app.get('/', c => {
  return c.html(PublicLayout({ 
    children: html`<div id="app">
      <div style="padding-left: 3rem; padding-right: 3rem; margin-left: auto; margin-right: auto;">
        <q-btn @click="toggleTheme" color="primary" style="margin-top: 1rem;">Toggle Theme</q-btn>
        <q-table 
          style="margin-top: 1rem;"
          title="Visits" 
          :columns="columns" 
          :rows="visitsSorted"
          row-key="id"
        ></q-table>
      </div>
    </div>
    `,
    foot: html`
    <script type="module">
      Vue.createApp({
        setup() {
          const $q = Quasar.useQuasar()

          const columns = Vue.ref([
            {
              name: 'url',
              label: 'URL',
              field: 'url',
              align: 'left',
            },
            {
              name: 'ip',
              label: 'IP Address',
              field: 'ip',
              align: 'right',
            },
            {
              name: 'accessed',
              label: 'Accessed',
              field: 'accessed',
              align: 'right',
            }  
          ])

          const visits = Vue.ref([])

          const visitsSorted = Vue.computed(() => {
            return visits.value.toReversed()
          })

          const toggleTheme = () => {
            $q.dark.toggle()
          }

          Vue.onMounted(() => {
            const socket = new WebSocket('${ Deno.env.get('PROTOCOL') === 'https' ? 'wss' : 'ws' }://${ Deno.env.get('HOST') }/updates')

            socket.onmessage = (e) => {
              const parsed = JSON.parse(e.data)
              visits.value.push({
                id: crypto.randomUUID(),
                url: parsed.url,
                ip: parsed.ip,
                accessed: parsed.accessed
              })
            }
          })

          return {
            columns,
            visits,
            visitsSorted,
            toggleTheme,
          }
        }
      }).use(Quasar, {
        config: {
          dark: true
        }
      }).mount('#app')
    </script>
    `
  }))
})

Deno.serve(async (req: Request, ci: Deno.ServeHandlerInfo) => {
  function clientIP(da: Deno.Addr) {
    if (["tcp", "udp"].includes(da.transport)) {
      const a = (da as Deno.NetAddr);
      return `${a.hostname}`;
    } else {
      const a = (da as Deno.UnixAddr);
      return a.path;
    }
  }

  return app.fetch(req, {
    clientIp: clientIP(ci.remoteAddr)
  })
})