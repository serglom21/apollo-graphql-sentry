const { ApolloServer } = require("@apollo/server");
const { ApolloGateway, IntrospectAndCompose } = require("@apollo/gateway");
const { expressMiddleware } = require("@apollo/server/express4")
const http = require('http');
const cors = require('cors');
const { json } = require('body-parser')
var express = require('express');
var Sentry = require('@sentry/node');

const app = express();
const supergraphSdl = new IntrospectAndCompose({
  // This entire subgraph list is optional when running in managed federation
  // mode, using Apollo Studio as the source of truth.  In production,
  // using a single source of truth to compose a schema is recommended and
  // prevents composition failures at runtime using schema validation using
  // real usage-based metrics.
  subgraphs: [
    { name: "accounts", url: "http://localhost:4001/graphql" }
  ],
});

Sentry.init({
    dsn: "https://5f3caa5fa5224df096b0da328346627a@o4504533099937792.ingest.sentry.io/4505321195241472",
    integrations: [
      // enable HTTP calls tracing
      new Sentry.Integrations.Http({ tracing: true }),
      new Sentry.Integrations.Undici(),
      // enable Express.js middleware tracing
      new Sentry.Integrations.Express({ app }),
      new Sentry.Integrations.Apollo(),
      new Sentry.Integrations.GraphQL()
      // Automatically instrument Node.js libraries and frameworks
      //...Sentry.autoDiscoverNodePerformanceMonitoringIntegrations(),
    ],
    tracesSampleRate: 1.0,
})

const httpServer = http.createServer(app);

// RequestHandler creates a separate execution context, so that all
// transactions/spans/breadcrumbs are isolated across requests
app.use(Sentry.Handlers.requestHandler());
// TracingHandler creates a trace for every incoming request
app.use(Sentry.Handlers.tracingHandler());

// the rest of your app

// The error handler must be before any other error middleware and after all controllers
app.use(Sentry.Handlers.errorHandler());

const gateway = new ApolloGateway({
  supergraphSdl,
  // Experimental: Enabling this enables the query plan view in Playground.
  __exposeQueryPlanExperimental: false,
});

(async () => {
  const server = new ApolloServer({
    gateway,

    // Apollo Graph Manager (previously known as Apollo Engine)
    // When enabled and an `ENGINE_API_KEY` is set in the environment,
    // provides metrics, schema management and trace reporting.
    engine: false,

    // Subscriptions are unsupported but planned for a future Gateway version.
    subscriptions: false,
  });

  await server.start()

  app.use('/graphql', cors(), json(), expressMiddleware(server, {
    context: async ({req}) => ({ token: req.headers.token}),
  }))


  // Start the server
  httpServer.listen({ port: 4000 }, () => {
      console.log(`Server ready at http://localhost:4000${server.graphqlPath}`);
    });
})();