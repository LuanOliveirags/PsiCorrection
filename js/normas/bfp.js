/* ═══════════════════════════════════════════════════════════════════
   BFP — Bateria Fatorial de Personalidade
   Nunes, Hutz & Nunes (2010) — Casa do Psicólogo
   Configuração de fatores, facetas e normas de referência
═══════════════════════════════════════════════════════════════════ */

const BFP_META = {
  id:      "bfp",
  versao:  "2010_BR",
  fonte:   "Nunes, C.H.S.S., Hutz, C.S. & Nunes, M.F.O. (2010). BFP. Casa do Psicologo.",
  tipo:    "estimada",
  nota:    "Tabelas de referencia. Consultar Manual oficial para normas completas."
};

const BFP_FATORES = {
  N: {
    nome: "Neuroticismo", sigla: "N",
    facetas: ["N1", "N2", "N3", "N4"],
    cor: [239, 68, 68],
    invertido: true,
    desc: "Tendência a experimentar emoções negativas como ansiedade, depressão e instabilidade."
  },
  E: {
    nome: "Extroversão", sigla: "E",
    facetas: ["E1", "E2", "E3", "E4"],
    cor: [245, 158, 11],
    invertido: false,
    desc: "Tendência a ser sociável, comunicativo, enérgico e buscar estimulação."
  },
  S: {
    nome: "Socialização", sigla: "S",
    facetas: ["S1", "S2", "S3"],
    cor: [16, 185, 129],
    invertido: false,
    desc: "Tendência a ser cooperativo, amigável, confiante e pró-social."
  },
  R: {
    nome: "Realização", sigla: "R",
    facetas: ["R1", "R2", "R3"],
    cor: [37, 99, 235],
    invertido: false,
    desc: "Tendência a ser competente, organizado, ponderado e persistente em objetivos."
  },
  A: {
    nome: "Abertura", sigla: "A",
    facetas: ["A1", "A2", "A3", "A4"],
    cor: [139, 92, 246],
    invertido: false,
    desc: "Tendência à curiosidade intelectual, criatividade e abertura a novas experiências."
  }
};

const BFP_FACETAS = {
  N1: { nome: "Vulnerabilidade",          fator: "N", desc: "Susceptibilidade ao estresse e insegurança emocional" },
  N2: { nome: "Instabilidade Emocional",  fator: "N", desc: "Oscilações de humor e reações emocionais intensas" },
  N3: { nome: "Passividade",              fator: "N", desc: "Tendência à passividade, dependência e falta de assertividade" },
  N4: { nome: "Depressão",                fator: "N", desc: "Sentimentos de tristeza, pessimismo e desânimo" },
  E1: { nome: "Comunicação",              fator: "E", desc: "Facilidade de expressão verbal e gosto por interações sociais" },
  E2: { nome: "Altivez",                  fator: "E", desc: "Assertividade, liderança e tendência à dominância social" },
  E3: { nome: "Dinamismo",                fator: "E", desc: "Energia, vitalidade e disposição para atividades" },
  E4: { nome: "Busca de Sensações",       fator: "E", desc: "Procura por experiências emocionantes e estimulantes" },
  S1: { nome: "Amabilidade",              fator: "S", desc: "Gentileza, cortesia e cuidado com o bem-estar alheio" },
  S2: { nome: "Pró-sociabilidade",        fator: "S", desc: "Comportamento voltado ao auxílio, cooperação e altruísmo" },
  S3: { nome: "Confiança nas Pessoas",    fator: "S", desc: "Crença nas boas intenções e na boa-fé das pessoas" },
  R1: { nome: "Competência",              fator: "R", desc: "Percepção de eficácia e capacidade para lidar com tarefas" },
  R2: { nome: "Ponderação",               fator: "R", desc: "Cuidado, reflexão e prudência antes de agir" },
  R3: { nome: "Empenho",                  fator: "R", desc: "Dedicação, diligência e persistência em objetivos" },
  A1: { nome: "Abertura a Ideias",        fator: "A", desc: "Curiosidade intelectual e interesse em conceitos e teorias" },
  A2: { nome: "Liberalismo",              fator: "A", desc: "Tolerância, abertura a mudanças e valores progressistas" },
  A3: { nome: "Busca de Novidades",       fator: "A", desc: "Gosto por novas experiências, variedade e aventura" },
  A4: { nome: "Atualização",              fator: "A", desc: "Busca ativa por informações, aprendizado e desenvolvimento" }
};

// Tabelas normativas carregadas do Firestore em runtime (após login).
// Fallback vazio — sem dados no bundle público.
const BFP_NORMAS_FACETA = {};

/** Calcula o T-score (T = 50 + 10 × (raw − µ) / σ) */
function bfpTScore(rawScore, facetaCod) {
  const tabelas = getServidorNormas()?.bfp ?? BFP_NORMAS_FACETA;
  const n = tabelas[facetaCod];
  if (!n) {
    if (!getServidorNormas()) console.warn("[bfp] Normas não carregadas do servidor.");
    return 50;
  }
  return Math.round(50 + 10 * (rawScore - n.media) / n.dp);
}

/** Converte T-score em percentil aproximado */
function bfpPercentil(tscore) {
  if (tscore <= 20) return 1;
  if (tscore <= 25) return 1;
  if (tscore <= 30) return 2;
  if (tscore <= 35) return 7;
  if (tscore <= 40) return 16;
  if (tscore <= 45) return 31;
  if (tscore <= 50) return 50;
  if (tscore <= 55) return 69;
  if (tscore <= 60) return 84;
  if (tscore <= 65) return 93;
  if (tscore <= 70) return 98;
  return 99;
}

/** Classifica o T-score em categoria qualitativa */
function bfpClassificar(tscore) {
  if (tscore <= 29) return { label: "Muito Baixo",  badge: "bfp-mb"  };
  if (tscore <= 39) return { label: "Baixo",         badge: "bfp-b"   };
  if (tscore <= 44) return { label: "Médio-Baixo",   badge: "bfp-mdb" };
  if (tscore <= 55) return { label: "Médio",         badge: "bfp-m"   };
  if (tscore <= 60) return { label: "Médio-Alto",    badge: "bfp-mda" };
  if (tscore <= 69) return { label: "Alto",          badge: "bfp-a"   };
  return                    { label: "Muito Alto",   badge: "bfp-ma"  };
}

/** Converte badge BFP para cores RGB para uso no PDF */
function bfpBadgeCor(badge) {
  const map = {
    "bfp-mb":  { bg: [254, 226, 226], txt: [153,  27,  27] },
    "bfp-b":   { bg: [254, 243, 199], txt: [133,  77,  14] },
    "bfp-mdb": { bg: [243, 244, 246], txt: [ 75,  85,  99] },
    "bfp-m":   { bg: [219, 234, 254], txt: [ 29,  78, 216] },
    "bfp-mda": { bg: [209, 250, 229], txt: [  6,  95,  70] },
    "bfp-a":   { bg: [220, 252, 231], txt: [ 21, 128,  61] },
    "bfp-ma":  { bg: [237, 233, 254], txt: [ 79,  70, 229] }
  };
  return map[badge] || { bg: [219, 234, 254], txt: [29, 78, 216] };
}

/** Badge genérico para uso nas tabelas de histórico (compatível com badge do sistema) */
function bfpClasseGenerica(tscore) {
  if (tscore >= 61) return { badge: "badge-superior",  label: `T=${tscore}` };
  if (tscore >= 45) return { badge: "badge-medio",     label: `T=${tscore}` };
  if (tscore >= 30) return { badge: "badge-medio-inf", label: `T=${tscore}` };
  return                    { badge: "badge-inferior",  label: `T=${tscore}` };
}

