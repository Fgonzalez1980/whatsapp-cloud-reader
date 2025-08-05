import {
  makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore
} from "@whiskeysockets/baileys";
import NodeCache from "node-cache";
import pino from "pino";
import { salvarMensagem } from "./db.js";
import dotenv from "dotenv";
import qrcode from "qrcode-terminal";

dotenv.config();

// 🧭 Lista de grupos que o bot vai monitorar
const gruposMap = {
  "5511956960045-1587390469@g.us": "🆓🆓 BR Angels Membros Investidores 🚀🚀",
  "5511993804455-1552131955@g.us": "AvantiNews",
  "557999299044-1571880878@g.us": "Subs /MarketP / Payments",
  "120363168958645796@g.us": "Pay Insights 🚀💲",
};

const startSock = async () => {
  const { state, saveCreds } = await useMultiFileAuthState("auth");
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger: pino({ level: "info" }), // Log detalhado para debug
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" }))
    },
    msgRetryCounterCache: new NodeCache(),
    generateHighQualityLinkPreview: true,
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("🔑 QR Code recebido. Escaneie para conectar:");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "open") {
      console.log("✅ Conectado com sucesso ao WhatsApp!");
    }

    if (connection === "close") {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log("🔌 Conexão encerrada. Reconectar?", shouldReconnect);
      if (shouldReconnect) startSock();
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];

    // Garante que é de um grupo
    if (!msg?.message || !msg.key.remoteJid.endsWith("@g.us")) return;

    const grupoId = msg.key.remoteJid;
    const grupoNome = gruposMap[grupoId];

    // Se não for um dos grupos mapeados, ignora
    if (!grupoNome) {
      console.log(`⏩ Mensagem ignorada de grupo não monitorado: ${grupoId}`);
      return;
    }

    // Extrai texto
    const texto =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      msg.message.imageMessage?.caption ||
      msg.message.videoMessage?.caption ||
      "";

    console.log(`📥 Mensagem recebida de "${grupoNome}": ${texto || "[sem texto]"}`);

    // Se não tiver link, não grava, mas mantém log
    if (!texto.includes("http")) {
      console.log(`⏩ Ignorada: mensagem sem link em "${grupoNome}"`);
      return;
    }

    // Se tiver link, salva no banco
    const autor = msg.key.participant || "desconhecido";
    const id = `${msg.key.remoteJid}-${msg.key.id}`;
    const timestamp = new Date((msg.messageTimestamp || Date.now()) * 1000);

    try {
      await salvarMensagem({
        id,
        grupo: grupoNome,
        mensagem: texto,
        fonte: "Grupo WhatsApp",
        relevancia: "Alta",
        datahora: timestamp
      });
      console.log("✅ Mensagem salva no banco com sucesso!");
    } catch (err) {
      console.error("❌ Erro ao salvar mensagem no banco:", err);
    }
  });
};

startSock();

// 🔄 Mantém container Railway vivo
setInterval(() => {}, 1 << 30);
