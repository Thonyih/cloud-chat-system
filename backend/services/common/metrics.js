import promClient from 'prom-client';

// Create a Registry to register the metrics
const register = new promClient.Registry();

// Add default metrics (CPU, memory, etc.)
promClient.collectDefaultMetrics({ register });

// Custom metrics
const httpRequestsTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'path', 'status'],
  registers: [register]
});

const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'path', 'status'],
  buckets: [0.001, 0.005, 0.015, 0.05, 0.1, 0.5, 1, 5],
  registers: [register]
});

const activeConnections = new promClient.Gauge({
  name: 'active_connections',
  help: 'Number of active connections',
  registers: [register]
});

// Custom application metrics
const onlineUsersGauge = new promClient.Gauge({
  name: 'online_users_total',
  help: 'Total number of users currently online',
  registers: [register]
});

const messagesSentCounter = new promClient.Counter({
  name: 'messages_sent_total',
  help: 'Total number of messages sent',
  labelNames: ['group_id'],
  registers: [register]
});

const messagesReceivedCounter = new promClient.Counter({
  name: 'messages_received_total',
  help: 'Total number of messages received by users',
  registers: [register]
});

const activeGroupsGauge = new promClient.Gauge({
  name: 'active_groups_total',
  help: 'Total number of active groups with recent activity',
  registers: [register]
});

const userRegistrationsCounter = new promClient.Counter({
  name: 'user_registrations_total',
  help: 'Total number of user registrations',
  registers: [register]
});

const userLoginsCounter = new promClient.Counter({
  name: 'user_logins_total',
  help: 'Total number of successful user logins',
  registers: [register]
});


// Middleware to track HTTP metrics
export function metricsMiddleware(req, res, next) {
  const start = Date.now();
  
  activeConnections.inc();
  
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const path = req.route ? req.route.path : req.path;
    
    httpRequestsTotal.inc({
      method: req.method,
      path: path,
      status: res.statusCode
    });
    
    httpRequestDuration.observe({
      method: req.method,
      path: path,
      status: res.statusCode
    }, duration);
    
    activeConnections.dec();
  });
  
  next();
}

// Metrics endpoint handler
export function metricsEndpoint(req, res) {
  res.set('Content-Type', register.contentType);
  register.metrics().then(metrics => {
    res.end(metrics);
  }).catch(err => {
    res.status(500).end(err);
  });
}


export { register, httpRequestsTotal, httpRequestDuration, activeConnections, onlineUsersGauge, messagesSentCounter, messagesReceivedCounter, activeGroupsGauge, userRegistrationsCounter, userLoginsCounter };
