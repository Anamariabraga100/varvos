/**
 * Configuração dos planos VARVOS para Pagar.me
 * Preços em centavos (Pagar.me usa centavos)
 */
window.VARVOS_PLANS = {
  // Planos avulsos: Pix e Cartão de crédito
  avulsos: {
    starter: {
      id: 'starter',
      name: 'Starter',
      amount: 1490,       // R$ 14,90
      credits: 20,
      description: '4 vídeos (200 créditos)',
    },
    popular: {
      id: 'popular',
      name: 'Popular',
      amount: 3990,       // R$ 39,90
      credits: 60,
      description: '12 vídeos (600 créditos)',
    },
    'pro-avulso': {
      id: 'pro-avulso',
      name: 'Pro',
      amount: 7990,       // R$ 79,90
      credits: 135,
      description: '27 vídeos (1.350 créditos)',
    },
    escala: {
      id: 'escala',
      name: 'Escala',
      amount: 29700,      // R$ 297,00
      credits: 600,
      description: '120 vídeos (6.000 créditos)',
    },
  },
  // Planos mensais: apenas Cartão (assinatura)
  mensais: {
    start: {
      id: 'start',
      name: 'Start',
      amount: 5990,       // R$ 59,90/mês
      credits: 150,
      description: '30 vídeos/mês (1.500 créditos)',
    },
    pro: {
      id: 'pro',
      name: 'Pro',
      amount: 14990,      // R$ 149,90/mês
      credits: 500,
      description: '100 vídeos/mês (5.000 créditos)',
    },
    agency: {
      id: 'agency',
      name: 'Agency',
      amount: 49700,      // R$ 497,00/mês
      credits: 2000,
      description: '400 vídeos/mês (20.000 créditos)',
    },
  },
};

// Helper: formata valor para exibição
function formatPlanPrice(cents) {
  return 'R$ ' + (cents / 100).toFixed(2).replace('.', ',');
}
