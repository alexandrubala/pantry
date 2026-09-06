export type ProductNutrition = {
  energyKcal100g: number | null
  proteinG100g: number | null
  carbohydratesG100g: number | null
  fatG100g: number | null
  sugarsG100g: number | null
  fiberG100g: number | null
  saltG100g: number | null
  servingSize: string | null
  energyKcalServing: number | null
  proteinGServing: number | null
  carbohydratesGServing: number | null
  fatGServing: number | null
}

export function isEmptyNutrition(nutrition: ProductNutrition | null | undefined): boolean {
  if (!nutrition) {
    return true
  }

  return (
    nutrition.energyKcal100g == null &&
    nutrition.proteinG100g == null &&
    nutrition.carbohydratesG100g == null &&
    nutrition.fatG100g == null &&
    nutrition.sugarsG100g == null &&
    nutrition.fiberG100g == null &&
    nutrition.saltG100g == null &&
    !nutrition.servingSize &&
    nutrition.energyKcalServing == null &&
    nutrition.proteinGServing == null &&
    nutrition.carbohydratesGServing == null &&
    nutrition.fatGServing == null
  )
}
