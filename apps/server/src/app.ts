import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import { env } from './lib/env';
import { logger } from './lib/logger';
import { requireAuth } from './middleware/auth';
import { errorHandler, notFoundHandler } from './middleware/error';
import { authRouter } from './modules/auth/routes';
import { usersRouter } from './modules/users/routes';
import { classroomsRouter } from './modules/classrooms/routes';
import { childrenRouter } from './modules/children/routes';
import { attendanceRouter } from './modules/attendance/routes';
import { dashboardRouter } from './modules/dashboard/routes';
import { activitiesRouter } from './modules/activities/routes';
import { reportsRouter } from './modules/activities/report';
import { calendarRouter } from './modules/calendar/routes';
import { messagesRouter } from './modules/messages/routes';
import { notificationsRouter } from './modules/notifications/routes';
import { medicationsRouter } from './modules/medications/routes';
import { liveStream } from './lib/live';
import { currentUser } from './middleware/auth';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  if (env.NODE_ENV !== 'test') app.use(pinoHttp({ logger }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/api/auth', authRouter);

  const api = express.Router();
  api.use(requireAuth);
  api.use('/users', usersRouter);
  api.use('/classrooms', classroomsRouter);
  api.use('/children', childrenRouter);
  api.use('/attendance', attendanceRouter);
  api.use('/dashboard', dashboardRouter);
  api.use('/activities', activitiesRouter);
  api.use('/reports', reportsRouter);
  api.use('/calendar', calendarRouter);
  api.use('/messages', messagesRouter);
  api.use('/notifications', notificationsRouter);
  api.use('/medications', medicationsRouter);
  api.get('/events', (req, res) => liveStream(res, currentUser(req)));
  app.use('/api', api);

  app.use('/api', notFoundHandler);
  app.use(errorHandler);
  return app;
}
