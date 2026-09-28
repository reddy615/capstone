require('dotenv').config();
const http = require('http');
const mongoose = require('mongoose');
const app = require('./app');
const connectDB = require('./config/db');
const initSocket = require('./config/socket');
const { startAIService, stopAIService } = require('./services/aiProcess');

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);
app.set('io', initSocket(server));
let aiProcess;

const startServer = async () => {
  try {
    aiProcess = await startAIService();
    app.set('aiProcess', aiProcess);
    console.log(`FastAPI AI service ready at http://${process.env.AI_SERVICE_HOST || '127.0.0.1'}:${process.env.AI_SERVICE_PORT || 8000}/health`);
  } catch (error) {
    console.error('FastAPI AI service failed to start. Continuing without AI integration:', error.message);
    app.set('aiProcess', null);
    app.set('aiServiceError', error.message);
  }

  await connectDB();

  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

startServer().catch((error) => {
  console.error('Failed to start server:', error);
  stopAIService(aiProcess);
  process.exit(1);
});

const shutdown = async (signal) => {
  console.log(`Received ${signal}; shutting down services.`);
  stopAIService(aiProcess);
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
