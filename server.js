'use strict';

const Fastify = require('fastify');
const sharp = require('sharp');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const API_KEY = process.env.API_KEY;
const BASE_PATH = process.env.BASE_PATH
  ? `/${process.env.BASE_PATH.replace(/^\/+|\/+$/g, '')}`
  : '';

if (!API_KEY) {
  console.error('Defina a variavel de ambiente API_KEY antes de iniciar o servico.');
  process.exit(1);
}

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
  },
  bodyLimit: 20 * 1024 * 1024,
});

app.addContentTypeParser('*', { parseAs: 'buffer' }, (req, body, done) => {
  done(null, body);
});

const healthPath = `${BASE_PATH}/health`;

app.addHook('onRequest', async (request, reply) => {
  if (request.method === 'GET' && request.url.split('?')[0] === healthPath) return;
  const header = request.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token || token !== API_KEY) {
    await reply.code(401).send({ error: 'Nao autorizado' });
  }
});

app.register(
  async function routes(instance) {
    instance.get('/health', async () => ({ status: 'ok' }));

    instance.post('/convert', async (request, reply) => {
      const input = request.body;

      if (!Buffer.isBuffer(input) || input.length === 0) {
        return reply.code(400).send({ error: 'Envie os bytes da imagem no corpo da requisicao' });
      }

      const width = Number(request.query.width);
      const height = Number(request.query.height);

      try {
        let pipeline = sharp(input).rotate();

        if (width > 0 && height > 0) {
          pipeline = pipeline.resize(width, height, { fit: 'cover', position: 'centre' });
        }

        const output = await pipeline.webp({ quality: 75 }).toBuffer();

        reply
          .code(200)
          .header('Content-Type', 'image/webp')
          .header('Content-Length', output.length)
          .send(output);
      } catch (err) {
        request.log.warn({ err }, 'Falha ao converter imagem');
        reply.code(422).send({ error: 'Arquivo de imagem invalido ou corrompido' });
      }
    });
  },
  { prefix: BASE_PATH }
);

app.listen({ host: HOST, port: PORT }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
