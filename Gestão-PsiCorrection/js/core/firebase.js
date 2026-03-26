/* ═══════════════════════════════════════════════════════
   FIREBASE — Configuração e Inicialização
   ─────────────────────────────────────────────────────
   PASSO A PASSO PARA CONFIGURAR:
   1. Acesse https://console.firebase.google.com/
   2. Crie um novo projeto (ou use um existente)
   3. Vá em "Configurações do projeto" → "Seus apps" → adicione um Web app
   4. Copie os valores do firebaseConfig e cole abaixo
   5. No painel do Firebase, vá em "Firestore Database" → crie o banco
   6. Em "Regras", cole as regras do arquivo firestore.rules.txt
═══════════════════════════════════════════════════════ */

const firebaseConfig = {
  apiKey: "AIzaSyDbswVvI_ujULr4Sp0N7s5-XWbW3K2QDGw",
  authDomain: "psicorrection.firebaseapp.com",
  projectId: "psicorrection",
  storageBucket: "psicorrection.firebasestorage.app",
  messagingSenderId: "382467886691",
  appId: "1:382467886691:web:198212726a72bd41a3b256"
};

firebase.initializeApp(firebaseConfig);

/**
 * Instância global do Firestore.
 * Usada em db.js, db_pacientes.js e script.js.
 */
const _firestoreDB = firebase.firestore();
