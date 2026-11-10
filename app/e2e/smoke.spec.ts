import { expect, test } from '@playwright/test'

test('library → player → play, loop, level, speed → back → language', async ({ page }) => {
  // The piano samples come from the network; the app must keep working without them.
  await page.route('https://tonejs.github.io/**', (route) => route.abort())
  await page.addInitScript(() => localStorage.setItem('pianoverse.lang', 'el'))

  await page.goto('/')
  await page.getByRole('link', { name: /Demo · Am F C G/ }).click()
  await expect(page.getByRole('img', { name: 'Νότες που πέφτουν προς το πληκτρολόγιο' })).toBeVisible()

  await page.getByRole('button', { name: 'Αναπαραγωγή' }).click()
  await expect(page.getByRole('button', { name: 'Παύση' })).toBeVisible()
  await expect(page.locator('.time')).not.toHaveText(/^0:00 \//)

  await page.getByRole('button', { name: 'Επανάληψη A–B' }).click()
  await expect(page.getByRole('button', { name: 'Επανάληψη A–B' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.loop-region')).toBeVisible()

  await page.getByRole('button', { name: 'Εύκολο' }).click()
  await expect(page.getByRole('button', { name: 'Εύκολο' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: /^Ταχύτητα/ }).click()
  await page.getByRole('button', { name: '75%', exact: true }).click()
  await page.getByRole('button', { name: 'Πιο αργά' }).click()
  await expect(page.getByRole('button', { name: 'Ταχύτητα 70%', exact: true })).toHaveText('70%')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('group', { name: 'Ταχύτητα' })).toBeHidden()

  await page.getByRole('link', { name: 'Πίσω στη βιβλιοθήκη' }).click()
  await page.getByRole('button', { name: 'EN' }).click()
  await expect(page.getByText('Your songs')).toBeVisible()
})
