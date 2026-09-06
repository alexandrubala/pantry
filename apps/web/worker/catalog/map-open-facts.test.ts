import { expect, test } from 'vitest'
import { mapOpenFactsProduct, sanitizeOpenFactsImageUrl } from './map-open-facts.js'

const nutella = {
  status: 'success',
  product: {
    code: '3017620422003',
    product_name: 'Nutella',
    brands: 'Nutella, Ferrero',
    image_front_url: 'https://images.openfoodfacts.org/images/products/301/762/042/2003/front_en.879.400.jpg',
    quantity: '400 g',
    product_quantity: 400,
    product_quantity_unit: 'g',
    product_type: 'food',
    serving_size: '15 g',
    nutriments: {
      'energy-kcal_100g': 539,
      proteins_100g: 6.3,
      carbohydrates_100g: 57.5,
      fat_100g: 30.9,
      sugars_100g: 56.3,
      fiber_100g: 3.6,
      salt_100g: 0.107,
      'energy-kcal_serving': 81,
      proteins_serving: 0.9,
      carbohydrates_serving: 8.6,
      fat_serving: 4.6,
    },
  },
}

test('maps a complete food product including nutrition and package quantity', () => {
  const product = mapOpenFactsProduct({
    barcode: '3017620422003',
    origin: 'open_food_facts',
    payload: nutella,
  })

  expect(product).toMatchObject({
    barcode: '3017620422003',
    catalog: 'open_food_facts',
    productType: 'food',
    name: 'Nutella',
    brand: 'Nutella, Ferrero',
    packageQuantity: 400,
    packageUnit: 'g',
    packageQuantityConfident: true,
    unit: 'g',
    nutrition: {
      energyKcal100g: 539,
      proteinG100g: 6.3,
      carbohydratesG100g: 57.5,
      fatG100g: 30.9,
      sugarsG100g: 56.3,
      fiberG100g: 3.6,
      saltG100g: 0.107,
      servingSize: '15 g',
      energyKcalServing: 81,
    },
  })
  expect(product?.imageUrl).toContain('images.openfoodfacts.org')
})

test('omits missing image, brand, and nutrition instead of inventing values', () => {
  const product = mapOpenFactsProduct({
    barcode: '3017620422003',
    origin: 'open_food_facts',
    payload: {
      product: {
        product_name: 'Mystery',
        product_type: 'food',
      },
    },
  })

  expect(product).toMatchObject({
    name: 'Mystery',
    brand: null,
    imageUrl: null,
    nutrition: null,
    packageQuantity: null,
    packageQuantityConfident: false,
    unit: 'package',
  })
})

test('preserves zero nutrients and leaves missing nutrients null', () => {
  const product = mapOpenFactsProduct({
    barcode: '3017620422003',
    origin: 'open_food_facts',
    payload: {
      product: {
        product_name: 'Zero salt',
        nutriments: {
          'energy-kcal_100g': 0,
          proteins_100g: 1.2,
          salt_100g: 0,
        },
      },
    },
  })

  expect(product?.nutrition).toMatchObject({
    energyKcal100g: 0,
    proteinG100g: 1.2,
    carbohydratesG100g: null,
    fatG100g: null,
    saltG100g: 0,
    sugarsG100g: null,
    fiberG100g: null,
  })
})

test('parses package g, kg, ml, and l', () => {
  expect(
    mapOpenFactsProduct({
      barcode: '111',
      origin: 'open_food_facts',
      payload: { product: { product_name: 'A', quantity: '500 g' } },
    })?.packageQuantity,
  ).toBe(500)
  expect(
    mapOpenFactsProduct({
      barcode: '1111111111111',
      origin: 'open_food_facts',
      payload: { product: { product_name: 'A', quantity: '1 kg' } },
    }),
  ).toMatchObject({ packageQuantity: 1000, packageUnit: 'g', unit: 'g' })
  expect(
    mapOpenFactsProduct({
      barcode: '1111111111112',
      origin: 'open_food_facts',
      payload: { product: { product_name: 'A', quantity: '750 ml' } },
    }),
  ).toMatchObject({ packageQuantity: 750, packageUnit: 'ml', unit: 'ml' })
  expect(
    mapOpenFactsProduct({
      barcode: '1111111111113',
      origin: 'open_food_facts',
      payload: { product: { product_name: 'A', quantity: '1 l' } },
    }),
  ).toMatchObject({ packageQuantity: 1000, packageUnit: 'ml', unit: 'ml' })
})

test('does not guess ambiguous package quantity', () => {
  const product = mapOpenFactsProduct({
    barcode: '1111111111114',
    origin: 'open_food_facts',
    payload: { product: { product_name: 'A', quantity: '2 x 500 g' } },
  })

  expect(product).toMatchObject({
    packageQuantity: null,
    packageUnit: null,
    packageQuantityConfident: false,
    unit: 'package',
  })
})

test('maps an Open Products Facts item without nutrition', () => {
  const product = mapOpenFactsProduct({
    barcode: '3560070472884',
    origin: 'open_products_facts',
    payload: {
      product: {
        product_name: 'Toothbrush',
        brands: 'Signal',
        product_type: 'product',
        image_front_url: 'https://images.openproductsfacts.org/images/products/front.jpg',
      },
    },
  })

  expect(product).toMatchObject({
    catalog: 'open_products_facts',
    productType: 'product',
    name: 'Toothbrush',
    brand: 'Signal',
    nutrition: null,
  })
})

test('rejects untrusted image URLs', () => {
  expect(sanitizeOpenFactsImageUrl('https://evil.example/x.png')).toBeNull()
  expect(sanitizeOpenFactsImageUrl('javascript:alert(1)')).toBeNull()
  expect(
    sanitizeOpenFactsImageUrl('https://images.openfoodfacts.org/images/products/front.jpg'),
  ).toBe('https://images.openfoodfacts.org/images/products/front.jpg')
})

test('returns null when the payload has no product', () => {
  expect(
    mapOpenFactsProduct({
      barcode: '3017620422003',
      origin: 'open_food_facts',
      payload: { status: 'failure', result: { id: 'product_not_found' } },
    }),
  ).toBeNull()
})
