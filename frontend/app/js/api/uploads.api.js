import { http, unwrap } from './http.js';

export const uploadsApi = {
  async signUpload(body = {}, token) {
    const result = await http.post('/uploads/sign', body, { token });
    return unwrap(result);
  },

  async uploadImage(file) {
    return new Promise((resolve, reject) => {
      if (!file) {
        reject(new Error('No image file selected.'));
        return;
      }
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        reject(new Error('Only JPEG, PNG, and WebP images are allowed.'));
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        reject(new Error('File size exceeds the 5 MB limit. Choose a smaller image.'));
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => resolve({ dataUrl: e.target.result });
      reader.onerror = () => reject(new Error('Failed to read image file.'));
      reader.readAsDataURL(file);
    });
  },
};
