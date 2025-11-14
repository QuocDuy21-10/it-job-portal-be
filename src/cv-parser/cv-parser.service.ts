import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
const pdfParse = require('pdf-parse');
import * as mammoth from 'mammoth';
import { ParsedDataDto } from 'src/resumes/dto/parsed-data.dto';

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
      const dataBuffer = fs.readFileSync(filePath);
      const data = await pdfParse(dataBuffer);
      
      this.logger.log(`Extracted ${data.text.length} characters from PDF`);
      return data.text;
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
   */
  cleanText(text: string): string {
    return text
      .replace(/\r\n/g, '\n') // Normalize line endings
      .replace(/\n{3,}/g, '\n\n') // Remove excessive line breaks
      .replace(/\t+/g, ' ') // Replace tabs with spaces
      .replace(/ {2,}/g, ' ') // Remove multiple spaces
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
