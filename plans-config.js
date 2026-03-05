/**
 * Configuração dos planos VARVOS para Pagar.me
 * Preços em centavos (Pagar.me usa centavos)
 */
window.VARVOS_PLANS = {
  // Planos avulsos: Pix e Cartão de crédito
  avulsos: {
    'boas-vindas': {
      id: 'boas-vindas',
      name: 'Oferta de boas-vindas',
      amount: 1490,       // R$ 14,90
      credits: 20,       // 200 créditos
      description: '200 créditos',
    },
    starter: {
      id: 'starter',
      name: 'Starter',
      amount: 1990,      // R$ 19,90
      credits: 25,       // 250 créditos
      description: '5 vídeos (250 créditos)',
    },
    popular: {
      id: 'popular',
      name: 'Popular',
      amount: 3990,       // R$ 39,90
      credits: 65,        // 650 créditos
      description: '13 vídeos (650 créditos)',
    },
    'pro-avulso': {
      id: 'pro-avulso',
      name: 'Pro',
      amount: 7990,       // R$ 79,90
      credits: 150,       // 1.500 créditos
      description: '30 vídeos (1.500 créditos)',
    },
    escala: {
      id: 'escala',
      name: 'Escala',
      amount: 29700,      // R$ 297,00
      credits: 610,       // 6.100 créditos
      description: '122 vídeos (6.100 créditos)',
    },
  },
  // Planos mensais: apenas Cartão (assinatura)
  mensais: {
    start: {
      id: 'start',
      name: 'Creator',
      amount: 5990,       // R$ 59,90/mês
      credits: 1500,      // 30 vídeos
      description: '30 vídeos/mês (1.500 créditos)',
    },
    pro: {
      id: 'pro',
      name: 'Pro',
      amount: 14990,      // R$ 149,90/mês
      credits: 4000,      // 80 vídeos — R$ 1,87/vídeo
      description: '80 vídeos/mês (4.000 créditos)',
    },
    agency: {
      id: 'agency',
      name: 'Agency',
      amount: 44900,      // R$ 449/mês
      credits: 15000,     // 300 vídeos — R$ 1,50/vídeo
      description: '300 vídeos/mês (15.000 créditos)',
    },
  },
};

// Helper: formata valor para exibição
function formatPlanPrice(cents) {
  return 'R$ ' + (cents / 100).toFixed(2).replace('.', ',');
}
