import { http, unwrap } from './http.js';

export const uploadsApi = {
  /**
   * Request signed upload signature from backend
   * @param {{ purpose: 'profile'|'post' }} body
   * @param {string} [token]
   */
  async signUpload(body = {}, token) {
    const result = await http.post('/uploads/sign', body, { token });
    return unwrap(result);
  },

  /**
   * Compress image via HTML5 Canvas (max 1280px, WebP or JPEG, max 5 MB)
   */
  async compressImage(file, maxDimension = 1280, quality = 0.85) {
    if (!file) throw new Error('No image file selected.');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      throw new Error('Only JPEG, PNG, and WebP images are allowed.');
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new Error('File size exceeds the 5 MB limit.');
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Failed to read image file.'));
      reader.onload = (e) => {
        const img = new Image();
        img.onerror = () => reject(new Error('Failed to parse image content.'));
        img.onload = () => {
          let { width, height } = img;
          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          // Test WebP support
          let mime = 'image/webp';
          let dataUrl = canvas.toDataURL(mime, quality);
          if (dataUrl.indexOf('data:image/webp') !== 0) {
            mime = 'image/jpeg';
            dataUrl = canvas.toDataURL(mime, quality);
          }

          canvas.toBlob((blob) => {
            resolve({ blob, dataUrl, width, height, mime });
          }, mime, quality);
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  },

  /**
   * Upload image directly to Cloudinary using signed parameters
   * Falls back gracefully to dataUrl if Cloudinary credentials not configured
   */
  async uploadImage(file, purpose = 'post', token) {
    const compressed = await this.compressImage(file);

    try {
      // 1. Get signed signature from backend
      const signData = await this.signUpload({ purpose }, token);
      if (signData && signData.uploadUrl && signData.apiKey && signData.signature) {
        // 2. Direct POST to Cloudinary with multipart FormData
        const formData = new FormData();
        formData.append('file', compressed.blob || file);
        formData.append('api_key', signData.apiKey);
        formData.append('timestamp', String(signData.timestamp));
        formData.append('signature', signData.signature);
        formData.append('folder', signData.folder);
        if (signData.allowedFormats) {
          formData.append('allowed_formats', signData.allowedFormats);
        }

        const cloudRes = await fetch(signData.uploadUrl, {
          method: 'POST',
          body: formData,
        });

        if (cloudRes.ok) {
          const cloudBody = await cloudRes.json();
          const secureUrl = cloudBody.secure_url || cloudBody.url;
          return {
            url: secureUrl,
            secureUrl,
            publicId: cloudBody.public_id,
            width: cloudBody.width,
            height: cloudBody.height,
            format: cloudBody.format,
            isDirectCloudinary: true,
          };
        }
      }
    } catch {
      // If Cloudinary signing fails (e.g. dev/offline), return compressed dataUrl for dev preview
    }

    return {
      url: compressed.dataUrl,
      secureUrl: compressed.dataUrl,
      width: compressed.width,
      height: compressed.height,
      isDirectCloudinary: false,
    };
  },
};
