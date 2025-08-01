import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

export async function salvarMensagem({ id, grupo, mensagem, fonte, relevancia, datahora }) {
  const query = `
    INSERT INTO public.agent11_whatsapp_news
    (id, grupo, mensagem, fonte, relevancia, datahora)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (id) DO NOTHING;
  `;

  const values = [id, grupo, mensagem, fonte, relevancia, datahora];

  try {
    await pool.query(query, values);
    console.log("✅ Mensagem gravada no banco com sucesso!");
  } catch (error) {
    console.error("❌ Erro ao gravar no banco:", error);
    throw error;
  }
}
