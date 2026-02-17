import axios, { AxiosInstance } from 'axios';
import { config } from './config.js';
import { logger } from './logger.js';

export interface Class {
  id: number;
  name: string;
  date: Date;
  limit: number;
}

export class OctivClient {
  private client: AxiosInstance;
  private accessToken: string | null = null;
  private isRefreshing: boolean = false;
  private failedQueue: any[] = [];

  private userId: number | null = null;
  private tenantId: number | null = null;
  private locationId: number | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: config.baseUrl,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Origin: 'https://app.octivfitness.com',
        Referer: 'https://app.octivfitness.com/',
      },
    });

    this.client.interceptors.request.use((req) => {
      if (this.accessToken) {
        req.headers.Authorization = `Bearer ${this.accessToken}`;
      }
      return req;
    });

    this.client.interceptors.response.use(
      (response) => {
        return response;
      },
      async (error) => {
        const originalRequest = error.config;

        if (error.response?.status === 401 && !originalRequest._retry) {
          if (this.isRefreshing) {
            return new Promise((resolve, reject) => {
              this.failedQueue.push({ resolve, reject });
            })
              .then((token) => {
                originalRequest.headers['Authorization'] = 'Bearer ' + token;
                return this.client(originalRequest);
              })
              .catch((err) => {
                return Promise.reject(err);
              });
          }

          originalRequest._retry = true;
          this.isRefreshing = true;

          try {
            logger.warn('Token expired, re-authenticating...');
            this.accessToken = null;
            await this.authenticate();
            const newToken = this.accessToken;
            this.processQueue(null, newToken);
            originalRequest.headers['Authorization'] = 'Bearer ' + newToken;
            return this.client(originalRequest);
          } catch (err) {
            this.processQueue(err, null);
            return Promise.reject(err);
          } finally {
            this.isRefreshing = false;
          }
        }

        return Promise.reject(error);
      },
    );
  }

  private processQueue(error: any, token: string | null = null) {
    this.failedQueue.forEach((prom) => {
      if (error) {
        prom.reject(error);
      } else {
        prom.resolve(token);
      }
    });

    this.failedQueue = [];
  }

  async authenticate(): Promise<void> {
    if (this.accessToken) {
      return;
    }

    try {
      logger.info(`Authenticating as ${config.email}...`);
      const loginResponse = await this.client.post('/login', {
        username: config.email,
        password: config.password,
      });

      this.accessToken = loginResponse.data.access_token;

      if (!this.accessToken) {
        throw new Error('No token found in login response');
      }
      logger.info('Authentication successful.');

      logger.debug(`Fetching me...`);
      const meResponse = await this.client.get('/users/me');

      this.userId = meResponse.data.id;
      this.tenantId = meResponse.data.user_tenants?.[0]?.tenant_id;
      this.locationId = meResponse.data.user_tenants?.[0]?.locations[0].id;

      if (!this.userId || !this.tenantId || !this.locationId) {
        throw new Error('No user ID or tenant ID found in me response');
      }
      logger.info(
        `User details retrieved successfully. User ID: ${this.userId}, Tenant ID: ${this.tenantId}, Location ID: ${this.locationId}`,
      );
    } catch (error: any) {
      logger.error(
        'Authentication failed:',
        error.response?.data || error.message,
      );
      throw error;
    }
  }

  async fetchClassesForRange(startDate: Date, endDate: Date): Promise<Class[]> {
    try {
      const formattedStartDate = startDate.toISOString().split('T')[0];
      const formattedEndDate = endDate.toISOString().split('T')[0];
      logger.info(
        `Fetching classes for range ${formattedStartDate} to ${formattedEndDate}...`,
      );
      const response = await this.client.get('/class-dates', {
        params: {
          'filter[tenantId]': this.tenantId,
          'filter[locationId]': this.locationId,
          'filter[between]': `${formattedStartDate},${formattedEndDate}`,
          'filter[isSession]': 0,
          internalAppend: 'withoutLocations',
          perPage: -1,
        },
      });
      logger.debug(`Classes fetched successfully:`);
      return response.data.data.map((item: any) => ({
        id: item.id,
        name: item.class ? item.class.name : item.name,
        date: new Date(`${item.date}T${item.start_time}`),
        limit: item.limit,
      }));
    } catch (error: any) {
      logger.error(
        `Fetching classes for range ${startDate} to ${endDate} failed:`,
        error.response?.data || error.message,
      );
      throw error;
    }
  }

  async bookClass(classDateId: string): Promise<void> {
    if (config.dryRun) {
      logger.info(`[DRY RUN] Would book class ${classDateId}...`);
      return;
    }
    try {
      logger.info(`[${classDateId}] ✏️ Booking class...`);
      await this.client.post('/class-bookings', {
        classDateId,
        userId: this.userId,
      });
      logger.info(`[${classDateId}] ✅ Class booked successfully.`);
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        logger.error(
          `[${classDateId}] ${error.status}: ${error.response?.data?.message}`,
        );
      } else {
        logger.error(`[${classDateId}] ${error}`);
      }
    }
  }
}
