import * as ImagePicker from "expo-image-picker";

export interface CapturedImageResult {
  success: boolean;
  imageBase64?: string;
  mimeType?: string;
  error?: string;
  canceled?: boolean;
}

/**
 * Capture a photo using the device camera.
 * Compresses the image to balanced quality (0.65) to stay well under size limits
 * and achieve low-latency upload.
 */
export async function capturePhotoWithCamera(): Promise<CapturedImageResult> {
  try {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      return {
        success: false,
        error: "Camera permission was not granted. Please enable camera access in your phone settings.",
      };
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.5,
      base64: true,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return {
        success: false,
        canceled: true,
      };
    }

    const asset = result.assets[0];
    if (!asset.base64) {
      return {
        success: false,
        error: "Failed to extract image data from camera.",
      };
    }

    const mimeType = asset.mimeType || "image/jpeg";

    return {
      success: true,
      imageBase64: asset.base64,
      mimeType: mimeType === "image/png" ? "image/png" : "image/jpeg",
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || "An unexpected error occurred while capturing the photo.",
    };
  }
}

/**
 * Pick an image from the photo library (accessible alternative).
 */
export async function pickPhotoFromLibrary(): Promise<CapturedImageResult> {
  try {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      return {
        success: false,
        error: "Photo library permission was not granted. Please enable photos access in settings.",
      };
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.5,
      base64: true,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return {
        success: false,
        canceled: true,
      };
    }

    const asset = result.assets[0];
    if (!asset.base64) {
      return {
        success: false,
        error: "Failed to read image data from photo library.",
      };
    }

    const mimeType = asset.mimeType || "image/jpeg";

    return {
      success: true,
      imageBase64: asset.base64,
      mimeType: mimeType === "image/png" ? "image/png" : "image/jpeg",
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || "An unexpected error occurred while selecting the photo.",
    };
  }
}
