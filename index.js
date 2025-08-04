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

// 🧭 Mapeamento dos grupos monitorados
const gruposMap = {
  "5511956960045-1587390469@g.us": "🆓🆓  BR Angels Membros Investidores 🚀🚀",
  "5511993804455-1552131955@g.us": "AvantiNews",
  "557999299044-1571880878@g.us": "Subs /MarketP / Payments",
  "120363168958645796@g.us": "Pay Insights 🚀💲",
};

const startSock = async () => {
  const { state, saveCreds } = await useMultiFileAuthState("auth");
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger: pino({ level: "info" }), // log para diagnóstico
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

    // Log completo da mensagem bruta recebida
    console.log("📥 Mensagem recebida bruta:", JSON.stringify(msg, null, 2));

    if (!msg?.message || !msg.key.remoteJid.endsWith("@g.us")) return;

    const grupoId = msg.key.remoteJid;
    const grupoNome = gruposMap[grupoId];
    if (!grupoNome) return;

    const texto =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      msg.message?.ephemeralMessage?.message?.extendedTextMessage?.text ||
      msg.message?.viewOnceMessage?.message?.extendedTextMessage?.text ||
      "";

    if (!texto.includes("http")) return;

    const autor = msg.key.participant || "desconhecido";
    const id = `${msg.key.remoteJid}-${msg.key.id}`;
    const timestamp = new Date((msg.messageTimestamp || Date.now()) * 1000);

    console.log(`📩 Mensagem com link de "${grupoNome}": ${texto}`);

    const payload = {
      id,
      grupo: grupoNome,
      mensagem: texto,
      fonte: "Grupo WhatsApp",
      relevancia: "Alta",
      datahora: timestamp
    };

    // Log do payload enviado ao banco
    console.log("📤 Payload enviado ao banco:", payload);

    try {
      await salvarMensagem(payload);
      console.log("✅ Mensagem salva no banco com sucesso!");
    } catch (err) {
      console.error("❌ Erro ao salvar mensagem no banco:", err);
    }
  });
};

startSock();

// 🔄 Garante que o container Railway continue vivo
setInterval(() => {}, 1 << 30);
