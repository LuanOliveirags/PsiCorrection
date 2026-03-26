/* ═══════════════════════════════════════════════════════
   PsiCorrection — engine/calculator.js
   Motor universal de avaliação psicológica.

   API unificada para qualquer instrumento registrado.
   Carregado APÓS normas/index.js e módulos.

   ┌──────────────────────────────────────────────────────────┐
   │  engine.calcular(tipo, dados?)  → executa cálculo       │
   │  engine.interpretar(av)         → interpretação clínica  │
   │  engine.resultado(av)           → retorno padronizado    │
   │  engine.gerarLaudo(av, ctx?)    → motor completo (laudo) │
   │  engine.exportarPDF(av)         → baixa laudo PDF        │
   │  engine.buildHTML(av, ctx)      → HTML do resultado      │
   │  engine.renderGraphs(av, ctx)   → gráficos Chart.js      │
   │  engine.meta(tipo)              → metadados das normas   │
   └──────────────────────────────────────────────────────────┘

   Para registrar um novo instrumento, adicione um case
   em cada método abaixo e um registro em normas/index.js.
═══════════════════════════════════════════════════════ */

const engine = {

  /**
   * Executa a correção de um instrumento.
   * @param {"wisc"|"neupsilin"|"neupsilin-inf"|"bfp"} tipo
   * @param {object} [dados] - dados opcionais (futuro: substitui leitura DOM)
   */
  calcular(tipo, dados) {
    switch (tipo) {
      case "wisc":          return calcularESalvarWISC(dados);
      case "neupsilin":     return calcularEsalvar(dados);
      case "neupsilin-inf": return calcularESalvarInf(dados);
      case "bfp":           return calcularESalvarBFP(dados);
      default:
        console.error("[engine.calcular] Instrumento não registrado:", tipo);
    }
  },

  /**
   * Gera o texto de interpretação clínica para uma avaliação calculada.
   * @param {object} av - objeto de avaliação salvo
   * @returns {string} HTML com a interpretação
   */
  interpretar(av) {
    switch (av?.tipoTeste) {
      case "WISC-IV":
        return gerarInterpretacaoWISC(av);
      case "NEUPSILIN-INF":
        return typeof gerarInterpretacaoInf === "function"
          ? gerarInterpretacaoInf(av) : gerarInterpretacao(av);
      case "BFP":
        return typeof gerarInterpretacaoBFP === "function"
          ? gerarInterpretacaoBFP(av) : "";
      default:
        return gerarInterpretacao(av);
    }
  },

  /**
   * Exporta o laudo em PDF para uma avaliação.
   * @param {object} av - objeto de avaliação
   */
  exportarPDF(av) {
    switch (av?.tipoTeste) {
      case "WISC-IV":       return exportarPDFWISC(av);
      case "NEUPSILIN-INF": return exportarPDFInf(av);
      case "BFP":           return exportarPDFBFP(av);
      default:              return exportarPDF(av);
    }
  },

  /**
   * Constrói o HTML do card de resultado para exibição inline ou modal.
   * @param {object} av  - objeto de avaliação
   * @param {string} ctx - contexto: "wisc-inline" | "modal" | etc.
   * @returns {string} HTML
   */
  buildHTML(av, ctx) {
    switch (av?.tipoTeste) {
      case "WISC-IV":       return buildResultadoWISCHTML(av, ctx);
      case "NEUPSILIN-INF": return buildResultadoHTMLInf(av, ctx);
      case "BFP":           return buildResultadoBFPHTML(av, ctx);
      default:              return buildResultadoHTML(av, ctx);
    }
  },

  /**
   * Renderiza os gráficos Chart.js de uma avaliação.
   * @param {object} av  - objeto de avaliação
   * @param {string} ctx - prefixo dos IDs de canvas
   */
  renderGraphs(av, ctx) {
    switch (av?.tipoTeste) {
      case "WISC-IV":       return renderizarGraficosWISC(av, ctx);
      case "NEUPSILIN-INF": return renderizarGraficosInf(av, ctx);
      case "BFP":           return renderizarGraficosBFP(av, ctx);
      default:              return renderizarGraficos(av, ctx);
    }
  },

  /**
   * Retorna o metadado de versionamento de normas para um instrumento.
   * Delega para NORMAS.meta(tipo).
   * @param {"wisc"|"neupsilin"|"neupsilin-inf"|"bfp"} tipo
   * @returns {{ id, versao, fonte, tipo, nota } | null}
   */
  meta(tipo) {
    return NORMAS.meta(tipo);
  },

  /**
   * Retorna o resultado de uma avaliação no formato padronizado canônico.
   * Usado pelo engine internamente e por consumidores externos (PDF, API futura).
   *
   *  {
   *    indices:       {},         // escores/índices do instrumento
   *    total:         { bruto, max },
   *    classificacao: {},         // badge e label da classificação geral
   *    interpretacao: "",         // texto clínico HTML
   *    metadados: {
   *      id, data, paciente,
   *      normas:      "2013_BR",  // versão das normas usadas
   *      tipo:        "estimada", // "real" | "estimada"
   *      instrumento: "WISC-IV"
   *    }
   *  }
   *
   * @param {object} av - objeto de avaliação salvo
   * @returns {object} resultado padronizado
   */
  resultado(av) {
    const tipoKey = av?.tipoTeste === "WISC-IV"        ? "wisc"
                  : av?.tipoTeste === "NEUPSILIN-INF"  ? "neupsilin-inf"
                  : av?.tipoTeste === "BFP"            ? "bfp"
                  : "neupsilin";

    const m = NORMAS.meta(tipoKey) || {};

    return {
      indices:       av.indices      || {},
      total:         { bruto: av.totalBruto ?? null, max: av.maxTotal ?? null },
      classificacao: av.classeGeral  || av.indices?.fsiq?.classe || {},
      interpretacao: engine.interpretar(av),
      metadados: {
        id:          av.id,
        data:        av.data,
        paciente:    av.paciente,
        normas:      m.versao      || "desconhecida",
        tipo:        m.tipo        || "estimada",
        instrumento: av.tipoTeste  || "desconhecido"
      }
    };
  },

  /**
   * Motor universal de laudo — combina buildHTML + interpretar + resultado.
   * Ponto de entrada único para gerar o laudo completo de qualquer instrumento.
   *
   *   const laudo = engine.gerarLaudo(av);
   *   laudo.html          // HTML para renderizar
   *   laudo.interpretacao // texto clínico
   *   laudo.resultado     // formato padronizado
   *
   * @param {object} av       - objeto de avaliação
   * @param {string} [ctx="modal"] - contexto de renderização
   * @returns {{ html, interpretacao, resultado }}
   */
  gerarLaudo(av, ctx = "modal") {
    return {
      html:          engine.buildHTML(av, ctx),
      interpretacao: engine.interpretar(av),
      resultado:     engine.resultado(av)
    };
  }

};
