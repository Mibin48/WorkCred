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
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const maxDim = 1280;
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL('image/webp', 0.85);
          resolve({ dataUrl: compressed, width, height });
        };
        img.onerror = () => reject(new Error('Failed to parse image for compression.'));
        img.src = e.target.result;
      };
      reader.onerror = () => reject(new Error('Failed to read image file.'));
      reader.readAsDataURL(file);
    });
  },
};
