import { test, expect } from "@playwright/test";

const WORKER_EMAIL = "worker@test.com";
const WORKER_PASSWORD = "Worker1234!";

test.describe("Worker shift flow", () => {
  test("login → start → pause → resume → end shift", async ({ page }) => {
    // 1. Navigate to login
    await page.goto("/login");
    await expect(page).toHaveURL("/login");

    // 2. Fill login form
    await page.getByTestId("email-input").fill(WORKER_EMAIL);
    await page.getByTestId("password-input").fill(WORKER_PASSWORD);
    await page.getByTestId("login-button").click();

    // 3. Assert redirect to dashboard
    await expect(page).toHaveURL("/worker/dashboard");

    // 4. Click "Iniciar Jornada"
    const startBtn = page.getByTestId("btn-start");
    await expect(startBtn).toBeVisible();
    await startBtn.click();

    // 5. Assert button changed to "Finalizar Jornada"
    await expect(page.getByTestId("btn-end")).toBeVisible();
    await expect(page.getByTestId("btn-pause")).toBeVisible();

    // 6. Click "Pausa"
    await page.getByTestId("btn-pause").click();

    // 7. Fill pause comment and submit
    await page.getByTestId("pause-comment").fill("Almuerzo");
    await page.getByRole("button", { name: "Pausar Jornada" }).click();

    // 8. Assert "Reanudar" is visible
    await expect(page.getByTestId("btn-resume")).toBeVisible();
    await expect(page.getByText("En pausa")).toBeVisible();

    // 9. Click "Reanudar"
    await page.getByTestId("btn-resume").click();

    // 10. Assert active state restored
    await expect(page.getByTestId("btn-end")).toBeVisible();

    // 11. Click "Finalizar Jornada"
    await page.getByTestId("btn-end").click();

    // 12. Assert back to idle state (start button visible)
    await expect(page.getByTestId("btn-start")).toBeVisible();
  });

  test("wrong credentials show error", async ({ page }) => {
    await page.goto("/login");
    await page.getByTestId("email-input").fill("wrong@test.com");
    await page.getByTestId("password-input").fill("badpassword");
    await page.getByTestId("login-button").click();

    await expect(page.getByText(/credenciales|invalid/i)).toBeVisible();
  });
});
