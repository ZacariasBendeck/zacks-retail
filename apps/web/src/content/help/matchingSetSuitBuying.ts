export type BuyerWorkflowStep = {
  title: string
  body: string
}

export const matchingSetSuitBuyingHelp = {
  title: 'Buying a Matching Suit Set',
  subtitle: 'Use this workflow when jackets, pants, and vests share the same material story but are bought and stocked as separate SKUs.',
  context: [
    'Create and maintain one real SKU per sellable component: jacket, pant, and vest.',
    'Use the matching set to plan the components together by vendor style, material, color, season, chain, and selling mode.',
    'The default suit planning ratio is 1 jacket : 1.2 pants : 0.5 vests unless the buyer changes it for that set.',
  ],
  steps: [
    {
      title: 'Confirm the component SKUs',
      body: 'Make sure the jacket, pant, and vest SKUs already exist with the correct vendor, department, category, cost, retail, and size grid.',
    },
    {
      title: 'Create or open the matching set',
      body: 'Enter the vendor, vendor style, material, shared color, season, chain, and sell mode. This header is the planning story that ties the pieces together.',
    },
    {
      title: 'Add the members and ratios',
      body: 'Add the jacket, pant, and vest as members. Keep the default ratio when appropriate, or adjust it if the vendor pack or selling pattern is different.',
    },
    {
      title: 'Review complete-set capacity',
      body: 'Check how many balanced sets the current on-hand and on-order inventory can support. The bottleneck role shows which piece limits suit sales.',
    },
    {
      title: 'Review orphan risk',
      body: 'Look at orphan units before buying. Orphans are excess jackets, pants, or vests above the balanced ratio and may become hard-to-sell inventory.',
    },
    {
      title: 'Generate the buying plan',
      body: 'Choose receipt month, sales horizon, and target cover weeks. The plan uses sales history, on-hand, on-order, target cover, and the set ratio to recommend buys.',
    },
    {
      title: 'Validate role and size recommendations',
      body: 'Review the role table first, then the size recommendation table. Size quantities should support the role recommendation without creating avoidable imbalance.',
    },
    {
      title: 'Check OTB before committing',
      body: 'Confirm the proposed cost and retail fit the correct department/category/month buckets. If OTB blocks the buy, reduce quantities, move the receipt month, or request an override.',
    },
    {
      title: 'Create the PO worksheet',
      body: 'When the plan is acceptable, save it and create a PO worksheet. The worksheet creates normal PO lines for the component SKUs, not a fake bundle SKU.',
    },
    {
      title: 'Monitor after receipt',
      body: 'After receiving, recheck balance and sell-through. Re-run the plan before reorders so pants, jackets, and vests stay in sellable proportion.',
    },
  ] satisfies BuyerWorkflowStep[],
}
