import dotenv from 'dotenv';

dotenv.config();

export const config = {
  azure: {
    clientId: process.env.CLIENT_ID,
    tenantId: process.env.TENANT_ID,
  },
  
  exchange: {
    mailboxEmail: process.env.MAILBOX_EMAIL,
  },
  
  openai: {
    endpoint: process.env.AZURE_OPENAI_ENDPOINT,
    apiKey: process.env.AZURE_OPENAI_API_KEY,
    deploymentName: process.env.AZURE_OPENAI_DEPLOYMENT_NAME,
  },
  
  database: {
    path: process.env.DATABASE_PATH || './data/emails.db',
  },
  
  app: {
    checkIntervalMinutes: parseInt(process.env.CHECK_INTERVAL_MINUTES) || 30,
    maxEmailsPerRun: parseInt(process.env.MAX_EMAILS_PER_RUN) || 50,
  },
};

export function validateConfig() {
  const required = [
    'azure.clientId',
    'azure.tenantId',
    'exchange.mailboxEmail',
    'openai.endpoint',
    'openai.apiKey',
    'openai.deploymentName'
  ];

  for (const path of required) {
    const value = path.split('.').reduce((obj, key) => obj?.[key], config);
    if (!value) {
      throw new Error(`Missing required configuration: ${path}`);
    }
  }
}