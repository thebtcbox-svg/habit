import axios from 'axios';

const token = '-hlkYCjKa0GlsxwiA7-mppFq5DSVusz1';
const url = 'https://directus-production-8063.up.railway.app';

async function setup() {
  const api = axios.create({
    baseURL: url,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  const safePost = async (endpoint: string, data: any) => {
    try {
      await api.post(endpoint, data);
    } catch (error: any) {
      if (error.response?.data?.errors?.[0]?.message?.includes('already exists')) {
        console.log(`Skipping ${JSON.stringify(data.collection || data.field)}: already exists`);
      } else {
        throw error;
      }
    }
  };

  try {
    console.log('Setting up users collection...');
    await safePost('/collections', {
      collection: 'users',
      schema: {},
      meta: { icon: 'person' },
    });
    await safePost('/fields/users', { field: 'telegram_id', type: 'string', meta: { interface: 'input' } });
    await safePost('/fields/users', { field: 'username', type: 'string', meta: { interface: 'input' } });
    await safePost('/fields/users', { field: 'total_xp', type: 'integer', schema: { default_value: 0 }, meta: { interface: 'input' } });

    console.log('Setting up habits collection...');
    await safePost('/collections', {
      collection: 'habits',
      schema: {},
      meta: { icon: 'check_circle' },
    });
    await safePost('/fields/habits', {
      field: 'user_id',
      type: 'uuid',
      meta: { interface: 'select-dropdown-m2o' },
      schema: { foreign_key_table: 'users', foreign_key_column: 'id' }
    });
    await safePost('/fields/habits', { field: 'name', type: 'string', meta: { interface: 'input' } });
    await safePost('/fields/habits', { field: 'active', type: 'boolean', schema: { default_value: true }, meta: { interface: 'boolean' } });
    await safePost('/fields/habits', { field: 'is_focus', type: 'boolean', schema: { default_value: false }, meta: { interface: 'boolean' } });
    await safePost('/fields/habits', { field: 'reminder_time', type: 'string', meta: { interface: 'input' } });
    await safePost('/fields/habits', { field: 'streak', type: 'integer', schema: { default_value: 0 }, meta: { interface: 'input' } });

    console.log('Setting up logs collection...');
    await safePost('/collections', {
      collection: 'logs',
      schema: {},
      meta: { icon: 'history' },
    });
    await safePost('/fields/logs', {
      field: 'habit_id',
      type: 'uuid',
      meta: { interface: 'select-dropdown-m2o' },
      schema: { foreign_key_table: 'habits', foreign_key_column: 'id' }
    });
    await safePost('/fields/logs', { field: 'date', type: 'date', meta: { interface: 'datetime' } });
    await safePost('/fields/logs', { field: 'status', type: 'string', meta: { interface: 'select-dropdown', options: { choices: [{ text: 'Done', value: 'done' }, { text: 'Not Done', value: 'not_done' }] } } });
    await safePost('/fields/logs', { field: 'note', type: 'text', meta: { interface: 'textarea' } });
    await safePost('/fields/logs', { field: 'xp_earned', type: 'integer', schema: { default_value: 0 }, meta: { interface: 'input' } });

    console.log('Setup complete!');
  } catch (error: any) {
    console.error('Setup failed:', error.response?.data || error.message);
  }
}

setup();
