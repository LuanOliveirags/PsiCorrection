/**
 * NEUPSILIN-INF — Tabelas Normativas
 * Referência: Salles, J.F., Fonseca, R.P., Cruz-Rodrigues, C., Mello, C.B., Barbosa, T.,
 *             & Miranda, M.C. (2011). Desenvolvimento do Instrumento de Avaliação
 *             Neuropsicológica Breve Infantil NEUPSILIN-Inf. Vetor Editora.
 *
 * Normas estratificadas por FAIXA ETÁRIA (ano a ano: 6–12 anos).
 * Aplicável a crianças de 6 anos a 12 anos e 11 meses (1º ao 6º ano do EF).
 *
 * ATENÇÃO: As normas oficiais do NEUPSILIN-INF levam em conta também Tipo de Escola
 * (pública/particular) e Região Geográfica. As tabelas abaixo são referências gerais
 * por faixa etária. Para estratificação completa, consulte o Manual oficial (Vetor Editora).
 *
 * Faixas: "6" | "7" | "8" | "9" | "10" | "11" | "12"
 *
 * Escores máximos por área (26 subtestes — versão infantil):
 *   Orientação Têmporo-Espacial   : 6
 *   Atenção                       : 22
 *   Percepção Visual              : 20
 *   Memória                       : 30
 *   Hab. Aritméticas              : 8
 *   Linguagem                     : 26
 *   Funções Executivas            : 18
 *   Habilidades Visuoconstrutivas : 16
 *   TOTAL                         : 146
 */

const NEUPSILIN_INF_META = {
  id:      "neupsilin-inf",
  versao:  "2011_BR",
  fonte:   "Salles, J.F. et al. (2011). NEUPSILIN-Inf. Vetor Editora.",
  tipo:    "estimada",
  nota:    "Estratificacao: faixa etaria x tipo escola x regiao. Consultar Manual Vetor Editora."
};

// Tabelas normativas carregadas do Firestore em runtime (após login).
// Fallback vazio — sem dados no bundle público.
const NORMAS_INF = {};

/* Escores máximos por área — NEUPSILIN-INF */
const MAX_SCORES_INF = {
  orientacao:  6,
  atencao:     22,
  percepcao:   20,
  memoria:     30,
  habilidades: 8,
  linguagem:   26,
  funcoes:     18,
  praxias:     16
};

/* Nomes das áreas — INF */
const AREA_NOMES_INF = {
  orientacao:  "Orientação Têmporo-Espacial",
  atencao:     "Atenção",
  percepcao:   "Percepção Visual",
  memoria:     "Memória",
  habilidades: "Habilidades Aritméticas",
  linguagem:   "Linguagem",
  funcoes:     "Funções Executivas",
  praxias:     "Habilidades Visuoconstrutivas"
};

/* Nomes dos subtestes — INF */
const SUB_NOMES_INF = {
  /* Orientação */
  inf_dia_semana: "Dia da semana", inf_dia_mes: "Dia do mês",
  inf_mes: "Mês", inf_ano: "Ano", inf_local: "Local", inf_cidade: "Cidade",
  /* Atenção */
  inf_digitos_direto:  "Dígitos — Ordem Direta",
  inf_digitos_inverso: "Dígitos — Ordem Inversa",
  inf_cancelamento:    "Cancelamento de Figuras",
  /* Percepção */
  inf_nomeacao:    "Nomeação de Figuras",
  inf_discriminacao: "Discriminação Visual",
  /* Memória */
  inf_trabalho_verbal: "Memória de Trabalho Verbal",
  inf_evocacao_imediata: "Evocação Imediata",
  inf_evocacao_tardia:   "Evocação Tardia",
  inf_reconhecimento:    "Reconhecimento",
  inf_semantica:         "Memória Semântica",
  /* Habilidades */
  inf_calculo:   "Cálculo Simples",
  inf_problemas: "Problemas Aritméticos",
  /* Linguagem */
  inf_fluencia:        "Fluência Verbal (categorias)",
  inf_compreensao_oral:"Compreensão Oral",
  inf_repeticao:       "Repetição de Palavras",
  inf_leitura:         "Leitura",
  inf_escrita:         "Escrita / Ditado",
  /* Funções Executivas */
  inf_fluencia_fonemica:     "Fluência Fonêmica (letra P)",
  inf_controle_inibitorico:  "Controle Inibitório",
  inf_resolucao_problemas:   "Resolução de Problemas",
  inf_abstracao:             "Abstração",
  /* Praxias */
  inf_construtiva: "Praxia Construtiva",
  inf_ideomotora:  "Praxia Ideomotora"
};

/**
 * Retorna faixa etária (ano exato) para NEUPSILIN-INF.
 * Suporta idades de 6 a 12 anos (6 a 12 anos e 11 meses).
 */
function getFaixaEtariaInf(idadeAnos) {
  if (idadeAnos < 6)  return "6";
  if (idadeAnos > 12) return "12";
  return String(idadeAnos);
}

/**
 * Calcula z-score para uma área do NEUPSILIN-INF.
 *
 * Prioridade de busca (da mais para a menos específica):
 *  1. Norma completa  →  chave "idade_tipoescola_regiao"  (ex: "8_publica_sul")
 *  2. Fallback        →  chave "idade"                    (ex: "8")
 *
 * Quando as normas estratificadas do manual forem inseridas em NORMAS_INF,
 * o sistema usará automaticamente a norma completa para cada criança.
 *
 * Como adicionar as normas completas em NORMAS_INF (para cada área):
 *   "8_publica_sul":        { media: X.X, dp: X.X },
 *   "8_particular_sudeste": { media: X.X, dp: X.X },
 *   ...
 *
 *   Chave = "IDADE_TIPOESCOLA_REGIAO"
 *   Tipos de escola : publica | particular
 *   Regiões         : norte | nordeste | centro_oeste | sudeste | sul
 *   Idades          : 6 | 7 | 8 | 9 | 10 | 11 | 12
 *
 * @param {string} area       - chave da área (ex: "orientacao")
 * @param {number} score      - escore bruto obtido
 * @param {number} idadeAnos  - idade em anos completos
 * @param {string} [tipoEscola] - "publica" | "particular"
 * @param {string} [regiao]     - "norte" | "nordeste" | "centro_oeste" | "sudeste" | "sul"
 * @returns {{ z, media, dp, classe, normalizacaoUsada }}
 */
function calcularZAreaInf(area, score, idadeAnos, tipoEscola = "", regiao = "") {
  const faixa = getFaixaEtariaInf(idadeAnos);
  const tabelas = getServidorNormas()?.["neupsilin-inf"] ?? NORMAS_INF;

  // 1ª tentativa: norma completa (idade × tipo de escola × região)
  const chaveCompleta = tipoEscola && regiao ? `${faixa}_${tipoEscola}_${regiao}` : null;
  const normaCompleta = chaveCompleta ? tabelas[area]?.[chaveCompleta] : null;

  // 2ª tentativa: fallback por idade apenas
  const normaFallback = tabelas[area]?.[faixa];

  const norma = normaCompleta ?? normaFallback;
  const normalizacaoUsada = normaCompleta ? "completa" : "parcial_idade";

  if (!norma) {
    if (!getServidorNormas()) console.warn("[neupsilin-inf] Normas não carregadas do servidor.");
    return { z: 0, media: 0, dp: 1, classe: classificarZ(0), normalizacaoUsada: "indisponivel" };
  }

  const z = (score - norma.media) / norma.dp;
  return { z: +z.toFixed(2), media: norma.media, dp: norma.dp, classe: classificarZ(z), normalizacaoUsada };
}

