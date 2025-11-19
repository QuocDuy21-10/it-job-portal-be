import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';

@Injectable()
export class CvParserService {
  private readonly logger = new Logger(CvParserService.name);

  /**
   * Extract text from CV file based on file type
   * @param filePath - Absolute path to CV file
   * @returns Extracted text content
   */
  async extractTextFromCV(filePath: string): Promise<string> {
    try {
      const ext = path.extname(filePath).toLowerCase();

      switch (ext) {
        case '.pdf':
          return await this.extractFromPDF(filePath);
        case '.doc':
        case '.docx':
          return await this.extractFromDOCX(filePath);
        case '.txt':
          return await this.extractFromTXT(filePath);
        default:
          throw new Error(`Unsupported file type: ${ext}`);
      }
    } catch (error) {
      this.logger.error(`Error extracting text from ${filePath}:`, error);
      throw new Error(`Text extraction failed: ${error.message}`);
    }
  }

  /**
   * Extract text from PDF file
   */
  private async extractFromPDF(filePath: string): Promise<string> {
    try {
      // Use PDFParse class (v2 API) with file path
      const parser = new PDFParse({ url: filePath });
      const result = await parser.getText();
      
      this.logger.log(`Extracted ${result.text.length} characters from PDF`);
      return result.text;
    } catch (error) {
      this.logger.error('PDF extraction error:', error);
      throw new Error(`PDF extraction failed: ${error.message}`);
    }
  }

  /**
   * Extract text from DOCX file
   */
  private async extractFromDOCX(filePath: string): Promise<string> {
    try {
      const result = await mammoth.extractRawText({ path: filePath });
      
      this.logger.log(`Extracted ${result.value.length} characters from DOCX`);
      return result.value;
    } catch (error) {
      this.logger.error('DOCX extraction error:', error);
      throw new Error(`DOCX extraction failed: ${error.message}`);
    }
  }

  /**
   * Extract text from TXT file
   */
  private async extractFromTXT(filePath: string): Promise<string> {
    try {
      const text = fs.readFileSync(filePath, 'utf-8');
      
      this.logger.log(`Extracted ${text.length} characters from TXT`);
      return text;
    } catch (error) {
      this.logger.error('TXT extraction error:', error);
      throw new Error(`TXT extraction failed: ${error.message}`);
    }
  }

  /**
   * Validate extracted text quality
   */
  validateExtractedText(text: string): { valid: boolean; reason?: string } {
    // Minimum length check
    if (text.length < 100) {
      return { valid: false, reason: 'Text too short (< 100 characters)' };
    }

    // Maximum length check (to prevent processing extremely large files)
    if (text.length > 50000) {
      return { valid: false, reason: 'Text too long (> 50000 characters)' };
    }

    // Check if text contains meaningful content
    const wordCount = text.split(/\s+/).length;
    if (wordCount < 50) {
      return { valid: false, reason: 'Not enough words (< 50)' };
    }

    return { valid: true };
  }

  /**
   * Clean and normalize extracted text
   * Minify text by removing noise characters and converting multiline to single line with periods
   */
  cleanText(text: string): string {
    return text
      // Remove special unicode characters and noise (bullet points, special symbols, etc.)
      .replace(/[•◦▪▫■□●○⬤◆◇★☆♦♢]+/g, '') // Remove bullet points
      .replace(/[\u2022\u2023\u2043\u204C\u204D\u2219\u25CB\u25CF\u25E6]/g, '') // Remove unicode bullets
      .replace(/[^\x00-\x7F\u00C0-\u024F\u1E00-\u1EFF]/g, '') // Remove non-Latin characters except Vietnamese
      
      // Normalize whitespace and line breaks
      .replace(/\r\n/g, '\n') // Normalize line endings
      .replace(/\t+/g, ' ') // Replace tabs with spaces
      .replace(/[ ]+/g, ' ') // Remove multiple spaces
      
      // Convert multiple line breaks to single line with period separator
      .replace(/\n{2,}/g, '. ') // Convert paragraph breaks to periods
      .replace(/\n/g, '. ') // Convert single line breaks to periods
      
      // Clean up punctuation
      .replace(/\.{2,}/g, '.') // Remove multiple periods
      .replace(/\.\s*\./g, '.') // Remove consecutive periods with spaces
      .replace(/\s*\.\s*/g, '. ') // Normalize period spacing
      .replace(/\.\s*,/g, ',') // Remove periods before commas
      .replace(/,\s*\./g, '.') // Remove commas before periods
      
      // Final cleanup
      .replace(/\s{2,}/g, ' ') // Remove any remaining multiple spaces
      .replace(/^\.\s*/, '') // Remove leading period
      .replace(/\s*\.\s*$/, '') // Remove trailing period
      .trim();
  }

  /**
   * Get file size in bytes
   */
  getFileSize(filePath: string): number {
    try {
      const stats = fs.statSync(filePath);
      return stats.size;
    } catch (error) {
      this.logger.error('Error getting file size:', error);
      return 0;
    }
  }

  /**
   * Check if file exists and is accessible
   */
  fileExists(filePath: string): boolean {
    try {
      return fs.existsSync(filePath);
    } catch (error) {
      return false;
    }
  }
}
