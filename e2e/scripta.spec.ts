import { expect, test } from '@playwright/test'

test.describe('Scripta demo flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('reads the sample note and keeps transcript, boxes and translation in sync', async ({
    page,
  }) => {
    await expect(page.getByRole('heading', { name: /read your handwriting/i })).toBeVisible()
    await expect(page.getByText(/Demo mode\./)).toBeVisible()

    await page.getByRole('button', { name: 'Try a sample note' }).click()

    const title = page.getByRole('textbox', { name: 'Note title' })
    await expect(title).toHaveValue(/Field Notes/)
    await expect(page.getByRole('textbox', { name: 'Heading text' })).toHaveValue(
      /Field Notes/,
    )

    const boxes = page.getByRole('button', { name: /^Select transcribed block/ })
    await expect(boxes).toHaveCount(7)

    await page.getByRole('button', { name: 'Translate', exact: true }).click()
    await expect(page.getByText(/Notas de campo/)).toBeVisible()
    await expect(page.getByText(/La marea subió antes de lo que predijo el almanaque/)).toBeVisible()

    const paragraph = page.getByRole('textbox', { name: 'Paragraph text' }).first()
    await paragraph.fill('The tide came in much earlier than the almanac predicted.')
    await expect(page.getByRole('button', { name: /Retranslate/ })).toBeVisible()
  })

  test('reviews uncertain blocks to zero, then archives the note locally', async ({ page }) => {
    await page.getByRole('button', { name: 'Try a sample note' }).click()
    await expect(page.getByRole('textbox', { name: 'Note title' })).toHaveValue(/Field Notes/)

    await page.keyboard.press('r')
    const review = page.getByRole('region', { name: 'Confidence review' })
    await expect(review).toContainText('Uncertain block')
    await expect(review).toContainText('1 / 2')

    await review.getByRole('button', { name: 'Looks right' }).click()
    await review.getByRole('button', { name: 'Looks right' }).click()
    await expect(review).toContainText('Every uncertain block reviewed')

    await page.keyboard.press('Escape')

    await expect(page.getByText(/Saved locally/)).toBeVisible()

    await page.getByRole('button', { name: 'History' }).click()
    const drawer = page.getByRole('dialog', { name: 'History' })
    await expect(drawer).toBeVisible()
    await expect(drawer.getByRole('button', { name: /Open Field Notes/ })).toBeVisible()
    await expect(drawer.getByText(/1 page/)).toBeVisible()
  })
})
