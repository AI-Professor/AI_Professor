export async function loadCaptcha(localBackendUrl) {
    try {
        const res = await fetch(`${localBackendUrl}/api/captcha`);
        const data = await res.json();
        console.log("Captcha data received:", data);
        if (!data.captcha_image || !data.captcha_id) {
            console.error("Captcha response missing required fields");
            return null;
        }
        return data;
    } catch (error) {
        console.error("Failed to load captcha:", error);
        return null;
    }
}
